import { getAsset, putAsset, listAssets, type AssetMeta } from "../services/assetStore.js";
import { corsHeaders } from "../utils/cors.js";
import { verifyAdminKey } from "./admin.js";

interface Env {
  CONTRACT_ADDRESS: string;
  CHAIN_RPC_URL: string;
  ALLOWED_ORIGINS: string;
  ASSETS: KVNamespace;
  BATCH_QUEUE: KVNamespace;
  ADMIN_KEY: string;
}

function unauthorized(env: Env): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: corsHeaders(env.ALLOWED_ORIGINS),
  });
}

export async function handleAssets(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  // GET /assets/:orgId
  const orgOnlyMatch = pathname.match(/^\/assets\/([^/]+)$/);
  if (request.method === "GET" && orgOnlyMatch) {
    const orgId = orgOnlyMatch[1];
    const assets = await listAssets(env.ASSETS, orgId);
    return new Response(JSON.stringify(assets), { status: 200, headers: jsonHeaders });
  }

  // POST /assets/:orgId
  if (request.method === "POST" && orgOnlyMatch) {
    const orgId = orgOnlyMatch[1];
    let body: Omit<AssetMeta, "recordId" | "createdAt" | "updatedAt" | "orgId">;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
    }

    const now = new Date().toISOString();
    const asset: AssetMeta = {
      ...body,
      recordId: crypto.randomUUID(),
      orgId,
      createdAt: now,
      updatedAt: now,
    };
    await putAsset(env.ASSETS, env.BATCH_QUEUE, asset);
    return new Response(JSON.stringify(asset), { status: 201, headers: jsonHeaders });
  }

  // Routes that need :recordId
  const recordMatch = pathname.match(/^\/assets\/([^/]+)\/([^/]+)$/);

  // GET /assets/:orgId/:recordId
  if (request.method === "GET" && recordMatch) {
    const [, orgId, recordId] = recordMatch;
    const asset = await getAsset(env.ASSETS, orgId, recordId);
    if (!asset) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
    }
    return new Response(JSON.stringify(asset), { status: 200, headers: jsonHeaders });
  }

  // PATCH /assets/:orgId/:recordId
  if (request.method === "PATCH" && recordMatch) {
    const [, orgId, recordId] = recordMatch;
    const existing = await getAsset(env.ASSETS, orgId, recordId);
    if (!existing) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
    }

    let body: Partial<AssetMeta>;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
    }

    const updated: AssetMeta = {
      ...existing,
      ...body,
      recordId: existing.recordId,
      orgId: existing.orgId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await putAsset(env.ASSETS, env.BATCH_QUEUE, updated);
    return new Response(JSON.stringify(updated), { status: 200, headers: jsonHeaders });
  }

  // DELETE /assets/:orgId/:recordId
  if (request.method === "DELETE" && recordMatch) {
    if (!verifyAdminKey(request, env.ADMIN_KEY)) return unauthorized(env);
    const [, orgId, recordId] = recordMatch;
    await env.ASSETS.delete(`${orgId}:asset:${recordId}`);
    // Mark batch dirty so the tree recomputes without this leaf
    const raw = await env.BATCH_QUEUE.get(`${orgId}:batch:pending`);
    const pending: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!pending.includes(recordId)) {
      pending.push(recordId);
      await env.BATCH_QUEUE.put(`${orgId}:batch:pending`, JSON.stringify(pending));
    }
    return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: jsonHeaders });
  }

  // GET /assets/:orgId/:recordId/proof
  const proofMatch = pathname.match(/^\/assets\/([^/]+)\/([^/]+)\/proof$/);
  if (request.method === "GET" && proofMatch) {
    const [, orgId, recordId] = proofMatch;
    const proofRaw = await env.ASSETS.get(`${orgId}:proof:${recordId}`);
    if (!proofRaw) {
      return new Response(JSON.stringify({ error: "Proof not found — run a batch first" }), {
        status: 404,
        headers,
      });
    }
    const proof = JSON.parse(proofRaw) as string[];
    return new Response(JSON.stringify({ proof, recordId }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
}
