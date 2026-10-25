import { corsHeaders } from "../utils/cors.js";
import { getDosesWithOverrides, overrideDoseStatus } from "../services/doseStore.js";
import type { DoseStatus } from "../services/medicationTypes.js";
import type { Env } from "../index.js";

const VALID_STATUSES: DoseStatus[] = ["pending", "taken", "missed", "skipped", "rescheduled"];

export async function handleDoses(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);
  const { method } = request;

  // GET /api/doses/due
  if (method === "GET" && pathname === "/api/doses/due") {
    const doses = getDosesWithOverrides();
    return Response.json(doses, { headers });
  }

  // POST /api/doses/:id/status
  const statusMatch = pathname.match(/^\/api\/doses\/([^/]+)\/status$/);
  if (method === "POST" && statusMatch) {
    const doseId = statusMatch[1];
    let body: { status?: string; notes?: string };
    try {
      body = (await request.json()) as { status?: string; notes?: string };
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
    }

    const status = body.status as DoseStatus | undefined;
    if (!status || !VALID_STATUSES.includes(status)) {
      return Response.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400, headers }
      );
    }

    // TODO: in production, persist to KV / D1 keyed by doseId
    overrideDoseStatus(doseId, status, body.notes);

    const updated = getDosesWithOverrides().find((d) => d.id === doseId);
    if (!updated) {
      return Response.json({ error: "Dose not found" }, { status: 404, headers });
    }
    return Response.json(updated, { headers });
  }

  return Response.json({ error: "Not found" }, { status: 404, headers });
}
