import { getAsset, putAsset, listAssets, type AssetMeta } from "../services/assetStore.js";
import { corsHeaders } from "../utils/cors.js";
import { verifyAdminKey } from "./admin.js";
import type { MedicationColor, MedicationDetails } from "../services/medicationTypes.js";
import { resetMedicationStock } from "../services/doseStore.js";

interface Env {
  DB: D1Database;
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
  const colors: MedicationColor[] = [
    "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink",
  ];
  if (!medication.color || !colors.includes(medication.color)) {
    return "medication color must be a valid medication color";
  }
  const isValidDate = (date: unknown): date is string => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  };
  if (!isValidDate(medication.startDate)) {
    return "medication startDate must use YYYY-MM-DD format";
  }
  if (medication.endDate !== undefined && !isValidDate(medication.endDate)) {
    return "medication endDate must use YYYY-MM-DD format";
  }
  if (typeof medication.active !== "boolean") return "medication active is required";
  if (!medication.schedule || typeof medication.schedule !== "object") {
    return "medication schedule is required";
  }
  if (!["daily", "weekdays", "interval"].includes(medication.schedule.type)) {
    return "medication schedule type must be daily, weekdays, or interval";
  }
  if (
    medication.schedule.type === "interval" &&
    (typeof medication.schedule.intervalHours !== "number" ||
      !Number.isFinite(medication.schedule.intervalHours) ||
      medication.schedule.intervalHours <= 0)
  ) {
    return "medication intervalHours must be a positive number for interval schedules";
  }
  if (
    medication.schedule.days !== undefined &&
    (!Array.isArray(medication.schedule.days) ||
      medication.schedule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
  ) {
    return "medication schedule days must be integers from 0 to 6";
  }
  if (!Array.isArray(medication.schedule.times) || medication.schedule.times.length === 0) {
    return "medication schedule must include at least one time";
  }
  if (medication.schedule.times.some(
    (time) => typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )) {
    return "medication schedule times must use HH:mm format";
  }
  if (medication.stock !== undefined) {
    if (!medication.stock || typeof medication.stock !== "object" || Array.isArray(medication.stock)) {
      return "medication stock must be an object";
    }
    if (
      typeof medication.stock.quantity !== "number" ||
      !Number.isFinite(medication.stock.quantity) ||
      medication.stock.quantity < 0
    ) {
      return "medication stock quantity must be a number of 0 or more";
    }
    if (typeof medication.stock.unit !== "string" || !medication.stock.unit.trim()) {
      return "medication stock unit must be a non-empty string";
    }
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
    const isAdmin = verifyAdminKey(request, env.ADMIN_KEY);
    const assets = (await listAssets(env.ASSETS, orgId))
      .filter((asset) => isAdmin || (asset.kind !== "medication" && !asset.medication));
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

    if (body.kind === "medication" && !verifyAdminKey(request, env.ADMIN_KEY)) {
      return unauthorized(env);
    }
    if (body.kind === "medication") {
      const error = validateMedication(body.medication);
      if (error) return new Response(JSON.stringify({ error }), { status: 400, headers });
    } else {
      delete body.medication;
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
    if (asset.kind === "medication") await resetMedicationStock(asset, env.DB);
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
    if (
      (asset.kind === "medication" || asset.medication) &&
      !verifyAdminKey(request, env.ADMIN_KEY)
    ) {
      return unauthorized(env);
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
    if (existing.kind === "medication" && !verifyAdminKey(request, env.ADMIN_KEY)) {
      return unauthorized(env);
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
    if (
      updated.kind === "medication" &&
      !verifyAdminKey(request, env.ADMIN_KEY)
    ) {
      return unauthorized(env);
    }
    if (updated.kind !== undefined && updated.kind !== "generic" && updated.kind !== "medication") {
      return new Response(JSON.stringify({ error: "kind must be generic or medication" }), {
        status: 400,
        headers,
      });
    }
    if (updated.kind === "medication") {
      const error = validateMedication(updated.medication);
      if (error) return new Response(JSON.stringify({ error }), { status: 400, headers });
    } else {
      delete updated.medication;
    }
    await putAsset(env.ASSETS, env.BATCH_QUEUE, updated);
    if (existing.kind === "medication" || updated.kind === "medication") {
      if (body.medication !== undefined || updated.kind !== "medication") {
        await resetMedicationStock(updated, env.DB);
      }
    }
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
