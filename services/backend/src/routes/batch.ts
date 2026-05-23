import { getPendingBatch } from "../services/assetStore.js";
import { makeChainService } from "../services/chain.js";
import { processBatch } from "../services/batchProcessor.js";
import { corsHeaders } from "../utils/cors.js";
import { verifyAdminKey } from "./admin.js";

interface Env {
  CONTRACT_ADDRESS: string;
  CHAIN_RPC_URL: string;
  ALLOWED_ORIGINS: string;
  ASSETS: KVNamespace;
  BATCH_QUEUE: KVNamespace;
  ADMIN_KEY: string;
  DEPLOYER_PRIVATE_KEY: string;
  W3UP_TOKEN: string;
}

function unauthorized(env: Env): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: corsHeaders(env.ALLOWED_ORIGINS),
  });
}

export async function handleBatch(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  if (!verifyAdminKey(request, env.ADMIN_KEY)) return unauthorized(env);

  // POST /batch/:orgId/process
  const processMatch = pathname.match(/^\/batch\/([^/]+)\/process$/);
  if (request.method === "POST" && processMatch) {
    const orgId = processMatch[1];
    const result = await processBatch(orgId, env, env.DEPLOYER_PRIVATE_KEY);
    if (!result) {
      return new Response(JSON.stringify({ message: "No pending changes" }), {
        status: 200,
        headers: jsonHeaders,
      });
    }
    return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders });
  }

  // GET /batch/:orgId/pending
  const pendingMatch = pathname.match(/^\/batch\/([^/]+)\/pending$/);
  if (request.method === "GET" && pendingMatch) {
    const orgId = pendingMatch[1];
    const pending = await getPendingBatch(env.BATCH_QUEUE, orgId);
    return new Response(JSON.stringify({ orgId, pending }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  // GET /batch/:orgId/checkpoints
  const checkpointsMatch = pathname.match(/^\/batch\/([^/]+)\/checkpoints$/);
  if (request.method === "GET" && checkpointsMatch) {
    const orgId = checkpointsMatch[1];
    const chain = makeChainService(env.CONTRACT_ADDRESS, env.CHAIN_RPC_URL);

    const count = await chain.getCheckpointCount(orgId);
    const take = count < 10n ? count : 10n;
    const start = count - take;

    const checkpoints = await Promise.all(
      Array.from({ length: Number(take) }, (_, i) =>
        chain.getCheckpoint(orgId, start + BigInt(i))
      )
    );

    return new Response(
      JSON.stringify(
        checkpoints.map((cp) => ({
          root: cp.root,
          metaCID: cp.metaCID,
          timestamp: cp.timestamp.toString(),
          assetCount: cp.assetCount.toString(),
        }))
      ),
      { status: 200, headers: jsonHeaders }
    );
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
}
