import { getAsset, putAsset, listAssets, type AssetMeta } from "../services/assetStore.js";
import { corsHeaders } from "../utils/cors.js";
import { verifyAdminKey } from "./admin.js";
import type { MedicationDetails } from "../services/medicationTypes.js";

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

function validateMedication(value: unknown): string | null {
  if (!value || typeof value !== "object") return "medication must be an object";
  const medication = value as Partial<MedicationDetails>;
  if (typeof medication.dosage !== "string" || !medication.dosage.trim()) {
    return "medication dosage is required";
  }
  if (typeof medication.recipientId !== "string" || !medication.recipientId.trim()) {
    return "medication recipientId is required";
  }
  if (typeof medication.form !== "string" || !medication.form.trim()) {
    return "medication form is required";
  }
  if (typeof medication.color !== "string" || !medication.color) {
    return "medication color is required";
  }
  if (typeof medication.startDate !== "string" || !medication.startDate) {
    return "medication startDate is required";
  }
  if (typeof medication.active !== "boolean") return "medication active is required";
  if (!medication.schedule || typeof medication.schedule !== "object") {
    return "medication schedule is required";
  }
  if (!["daily", "weekdays", "interval"].includes(medication.schedule.type)) {
    return "medication schedule type must be daily, weekdays, or interval";
  }
  if (!Array.isArray(medication.schedule.times) || medication.schedule.times.length === 0) {
    return "medication schedule must include at least one time";
  }
  if (medication.schedule.times.some(
    (time) => typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )) {
    return "medication schedule times must use HH:mm format";
  }
  if (typeof medication.timezone !== "string" || !medication.timezone) {
    return "medication timezone is required";
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: medication.timezone });
  } catch {
    return "medication timezone must be a valid IANA timezone";
  }
  return null;
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "Invalid asset" }), { status: 400, headers });
    }
    if (body.kind !== undefined && body.kind !== "generic" && body.kind !== "medication") {
      return new Response(JSON.stringify({ error: "kind must be generic or medication" }), {
        status: 400,
        headers,
      });
    }

    if (body.kind === "medication") {
      const error = validateMedication(body.medication);
      if (error) return new Response(JSON.stringify({ error }), { status: 400, headers });
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "Invalid asset" }), { status: 400, headers });
    }

    const updated: AssetMeta = {
      ...existing,
      ...body,
      recordId: existing.recordId,
      orgId: existing.orgId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    if (updated.kind !== undefined && updated.kind !== "generic" && updated.kind !== "medication") {
      return new Response(JSON.stringify({ error: "kind must be generic or medication" }), {
        status: 400,
        headers,
      });
    }
    if (updated.kind === "medication") {
      const error = validateMedication(updated.medication);
      if (error) return new Response(JSON.stringify({ error }), { status: 400, headers });
    }
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
