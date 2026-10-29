import { corsHeaders } from "../utils/cors.js";
import { verifyAdminKey } from "./admin.js";
import type { CareRecipient } from "../services/medicationTypes.js";
import type { Env } from "../index.js";
import { addRecipient, listRecipients } from "../services/recipientStore.js";

export async function handleRecipients(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);
  const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const orgMatch = pathname.match(/^\/api\/recipients\/([^/]+)$/);
  const recipientMatch = pathname.match(/^\/api\/recipients\/([^/]+)\/([^/]+)$/);

  if (request.method === "GET" && orgMatch) {
    if (!verifyAdminKey(request, env.ADMIN_KEY)) return unauthorized();
    const orgId = orgMatch[1];
    return Response.json(await listRecipients(env.ASSETS, orgId), {
      headers,
    });
  }

  if (request.method === "POST" && orgMatch) {
    if (!verifyAdminKey(request, env.ADMIN_KEY)) return unauthorized();
    let body: Partial<CareRecipient>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
    }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.name !== "string" || !body.name.trim()) {
      return Response.json({ error: "name is required" }, { status: 400, headers });
    }
    if (body.id !== undefined && (typeof body.id !== "string" || !body.id.trim())) {
      return Response.json({ error: "id must be a non-empty string" }, { status: 400, headers });
    }
    if (body.dateOfBirth !== undefined && body.dateOfBirth !== null &&
      typeof body.dateOfBirth !== "string") {
      return Response.json({ error: "dateOfBirth must be a string" }, { status: 400, headers });
    }
    if (body.notes !== undefined && body.notes !== null && typeof body.notes !== "string") {
      return Response.json({ error: "notes must be a string" }, { status: 400, headers });
    }

    const orgId = orgMatch[1];
    const recipient = await addRecipient(env.ASSETS, orgId, {
      id: body.id,
      name: body.name,
      ...(body.dateOfBirth !== undefined ? { dateOfBirth: body.dateOfBirth } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });
    if (!recipient) {
      return Response.json({ error: "Recipient already exists" }, { status: 409, headers });
    }
    return Response.json(recipient, { status: 201, headers });
  }

  if (recipientMatch && request.method === "GET") {
    if (!verifyAdminKey(request, env.ADMIN_KEY)) return unauthorized();
    const [, orgId, id] = recipientMatch;
    const value = await env.ASSETS.get(`${orgId}:recipient:${id}`);
    if (!value) return Response.json({ error: "Recipient not found" }, { status: 404, headers });
    return Response.json(JSON.parse(value) as CareRecipient, { headers });
  }

  if (recipientMatch && request.method === "PATCH") {
    if (!verifyAdminKey(request, env.ADMIN_KEY)) return unauthorized();
    const [, orgId, id] = recipientMatch;
    const key = `${orgId}:recipient:${id}`;
    const value = await env.ASSETS.get(key);
    if (!value) return Response.json({ error: "Recipient not found" }, { status: 404, headers });

    let body: Partial<Omit<CareRecipient, "id">> & {
      dateOfBirth?: string | null;
      notes?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Invalid recipient" }, { status: 400, headers });
    }
    if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
      return Response.json({ error: "name must be a non-empty string" }, { status: 400, headers });
    }
    if (body.dateOfBirth !== undefined && body.dateOfBirth !== null &&
      typeof body.dateOfBirth !== "string") {
      return Response.json({ error: "dateOfBirth must be a string" }, { status: 400, headers });
    }
    if (body.notes !== undefined && body.notes !== null && typeof body.notes !== "string") {
      return Response.json({ error: "notes must be a string" }, { status: 400, headers });
    }

    const existing = JSON.parse(value) as CareRecipient;
    const updated: CareRecipient = {
      id,
      name: body.name ?? existing.name,
      dateOfBirth: body.dateOfBirth === null ? undefined : body.dateOfBirth ?? existing.dateOfBirth,
      notes: body.notes === null ? undefined : body.notes ?? existing.notes,
    };
    await env.ASSETS.put(key, JSON.stringify(updated));
    return Response.json(updated, { headers });
  }

  return Response.json({ error: "Not found" }, { status: 404, headers });
}
