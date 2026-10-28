import { corsHeaders } from "../utils/cors.js";
import { getAdherence, listDoses, setDoseStatus } from "../services/doseStore.js";
import { verifyAdminKey } from "./admin.js";
import type { DoseSource } from "../services/doseStore.js";
import type { DoseStatus } from "../services/medicationTypes.js";
import type { Env } from "../index.js";

const VALID_STATUSES: DoseStatus[] = ["pending", "taken", "missed", "skipped", "rescheduled"];
const VALID_SOURCES: DoseSource[] = ["web", "qr", "mcp", "alexa", "telegram"];

function parseUtc(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    return null;
  }
  return date.toISOString();
}

export async function handleDoses(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!verifyAdminKey(request, env.ADMIN_KEY)) return json({ error: "Unauthorized" }, 401);
  const params = new URL(request.url).searchParams;

  const listMatch = pathname.match(/^\/api\/doses\/([^/]+)\/(due|history)$/);
  if (request.method === "GET" && listMatch) {
    const [, orgId, view] = listMatch;
    let from: string;
    let to: string;
    if (view === "due") {
      const window = params.get("window") ?? "12h";
      const match = window.match(/^(\d+(?:\.\d+)?)(h|m)$/);
      const hours = match ? Number(match[1]) / (match[2] === "m" ? 60 : 1) : 0;
      if (hours <= 0 || hours > 168) return json({ error: "window must be between 0 and 168 hours" }, 400);
      const now = Date.now();
      from = new Date(now - hours * 3_600_000).toISOString();
      to = new Date(now + hours * 3_600_000).toISOString();
    } else {
      const parsedFrom = parseUtc(params.get("from"));
      const parsedTo = parseUtc(params.get("to"));
      if (!parsedFrom || !parsedTo || parsedFrom >= parsedTo) {
        return json({ error: "from and to must be ISO UTC timestamps with from before to" }, 400);
      }
      from = parsedFrom;
      to = parsedTo;
    }
    const status = params.get("status");
    if (status !== null && !VALID_STATUSES.includes(status as DoseStatus)) {
      return json({ error: "Invalid status" }, 400);
    }
    return json(await listDoses(orgId, env, {
      from, to,
      recipientId: params.get("recipientId") ?? undefined,
      status: status === null ? undefined : status as DoseStatus,
    }));
  }

  const statusMatch = pathname.match(/^\/api\/doses\/([^/]+)\/([^/]+)\/status$/);
  if (request.method === "POST" && statusMatch) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Invalid dose status" }, 400);
    }
    const { status, source = "web", notes } = body as Record<string, unknown>;
    if (typeof status !== "string" || !VALID_STATUSES.includes(status as DoseStatus)) {
      return json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, 400);
    }
    if (typeof source !== "string" || !VALID_SOURCES.includes(source as DoseSource)) {
      return json({ error: "Invalid source" }, 400);
    }
    if (notes !== undefined && (typeof notes !== "string" || notes.length > 10_000)) {
      return json({ error: "notes must be a string of at most 10000 characters" }, 400);
    }
    const updated = await setDoseStatus(
      statusMatch[1], env, statusMatch[2], status as DoseStatus, source as DoseSource, notes as string | undefined
    );
    return updated ? json(updated) : json({ error: "Dose not found" }, 404);
  }
  return json({ error: "Not found" }, 404);
}

export async function handleAdherence(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!verifyAdminKey(request, env.ADMIN_KEY)) return json({ error: "Unauthorized" }, 401);
  const match = pathname.match(/^\/api\/adherence\/([^/]+)$/);
  if (request.method !== "GET" || !match) return json({ error: "Not found" }, 404);
  const params = new URL(request.url).searchParams;
  const days = Number(params.get("days") ?? "30");
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    return json({ error: "days must be an integer from 1 to 366" }, 400);
  }
  const now = Date.now();
  return json(await getAdherence(match[1], env, {
    from: new Date(now - days * 86_400_000).toISOString(),
    to: new Date(now).toISOString(),
    recipientId: params.get("recipientId") ?? undefined,
  }));
}
