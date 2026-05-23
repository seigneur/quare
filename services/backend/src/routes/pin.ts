import { makeChainService } from "../services/chain.js";
import { getSecrets } from "../services/kv.js";
import { comparePin } from "../utils/crypto.js";
import { corsHeaders } from "../utils/cors.js";

interface Env {
  CONTRACT_ADDRESS: string;
  CHAIN_RPC_URL: string;
  ALLOWED_ORIGINS: string;
  RECORD_SECRETS: KVNamespace;
}

export async function handlePinVerify(request: Request, env: Env): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);

  let body: { recordId?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
  }

  const { recordId, pin } = body;
  if (!recordId || !pin) {
    return new Response(
      JSON.stringify({ error: "recordId and pin are required" }),
      { status: 400, headers }
    );
  }

  const chain = makeChainService(env.CONTRACT_ADDRESS, env.CHAIN_RPC_URL);

  let record;
  try {
    record = await chain.getRecord(recordId);
  } catch {
    // contract reverts for missing or revoked records
    return new Response(JSON.stringify({ error: "Record not found" }), { status: 404, headers });
  }

  const secrets = await getSecrets(env.RECORD_SECRETS, recordId);
  if (!secrets) {
    return new Response(JSON.stringify({ error: "Record not found" }), { status: 404, headers });
  }

  const match = await comparePin(pin, secrets.salt, record.pinHash);
  if (!match) {
    return new Response(JSON.stringify({ error: "Invalid PIN" }), { status: 401, headers });
  }

  return new Response(
    JSON.stringify({ cid: record.cid, salt: secrets.salt, iv: secrets.iv }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
  );
}
