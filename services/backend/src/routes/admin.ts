import { makeChainService } from "../services/chain.js";
import { storeSecrets, getSecrets, deleteSecrets } from "../services/kv.js";
import { corsHeaders } from "../utils/cors.js";
import { createToken, tokenGrantSchema } from "../services/mcpTokens.js";
import { z } from "zod";

interface Env {
  CONTRACT_ADDRESS: string;
  CHAIN_RPC_URL: string;
  ALLOWED_ORIGINS: string;
  RECORD_SECRETS: KVNamespace;
  ADMIN_KEY: string;
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export function verifyAdminKey(request: Request, adminKey: string): boolean {
  const provided = request.headers.get("X-Admin-Key") ?? "";
  return adminKey.length > 0 && timingSafeEqual(provided, adminKey);
}

function unauthorized(env: Env): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: corsHeaders(env.ALLOWED_ORIGINS),
  });
}

export async function handleAdmin(request: Request, env: Env, pathname: string): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);

  if (!verifyAdminKey(request, env.ADMIN_KEY)) return unauthorized(env);

  if (pathname === "/admin/mcp-tokens" &&
    (request.method === "POST" || request.method === "DELETE")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
    }
    if (request.method === "POST") {
      const parsed = tokenGrantSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: "orgId and read/write scopes are required" }, { status: 400, headers });
      }
      const credentials = await createToken(env.RECORD_SECRETS, parsed.data);
      return Response.json({ ...credentials, ...parsed.data }, { status: 201, headers });
    }
    const parsed = z.strictObject({ tokenId: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "tokenId must be a SHA-256 hex hash" }, { status: 400, headers });
    }
    await env.RECORD_SECRETS.delete(`mcp:token:${parsed.data.tokenId}`);
    return Response.json({ revoked: true }, { headers });
  }

  // POST /admin/records/:id/revoke
  const revokeMatch = pathname.match(/^\/admin\/records\/([^/]+)\/revoke$/);
  if (request.method === "POST" && revokeMatch) {
    const id = revokeMatch[1];
    await deleteSecrets(env.RECORD_SECRETS, id);
    return new Response(
      JSON.stringify({ revoked: true, note: "KV secrets deleted. Submit revokeRecord() tx on-chain to fully revoke." }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  // POST /admin/records — store salt+iv in KV after on-chain store
  if (request.method === "POST" && pathname === "/admin/records") {
    let body: { recordId?: string; salt?: string; iv?: string };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
    }

    const { recordId, salt, iv } = body;
    if (!recordId || !salt || !iv) {
      return new Response(
        JSON.stringify({ error: "recordId, salt and iv are required" }),
        { status: 400, headers }
      );
    }

    const existing = await getSecrets(env.RECORD_SECRETS, recordId);
    if (existing) {
      return new Response(
        JSON.stringify({ error: "Secrets already exist for this recordId" }),
        { status: 409, headers }
      );
    }

    await storeSecrets(env.RECORD_SECRETS, recordId, salt, iv);
    return new Response(JSON.stringify({ stored: true }), {
      status: 201,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // GET /admin/records/:id
  const getMatch = pathname.match(/^\/admin\/records\/([^/]+)$/);
  if (request.method === "GET" && getMatch) {
    const id = getMatch[1];
    const chain = makeChainService(env.CONTRACT_ADDRESS, env.CHAIN_RPC_URL);

    let record;
    let revoked = false;
    try {
      record = await chain.getRecord(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      revoked = msg.includes("revoked");
      if (!revoked) {
        return new Response(JSON.stringify({ error: "Record not found on chain" }), { status: 404, headers });
      }
    }

    const secrets = await getSecrets(env.RECORD_SECRETS, id);

    return new Response(
      JSON.stringify({
        cid: record?.cid ?? null,
        orgId: record?.orgId ?? null,
        revoked: revoked || (record?.revoked ?? false),
        hasSecrets: secrets !== null,
      }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
}
