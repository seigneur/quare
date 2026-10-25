import { corsHeaders } from "../utils/cors.js";
import { RECIPIENTS } from "../services/mockData.js";
import type { Env } from "../index.js";

export async function handleRecipients(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);
  const { method } = request;

  // GET /api/recipients
  if (method === "GET" && pathname === "/api/recipients") {
    return Response.json(RECIPIENTS, { headers });
  }

  return Response.json({ error: "Not found" }, { status: 404, headers });
}
