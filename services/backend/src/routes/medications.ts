import { corsHeaders } from "../utils/cors.js";
import { MEDICATIONS, MEDICATION_INSIGHTS } from "../services/mockData.js";
import type { Env } from "../index.js";

export async function handleMedications(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);
  const { method } = request;

  // GET /api/medications
  if (method === "GET" && pathname === "/api/medications") {
    return Response.json(MEDICATIONS, { headers });
  }

  // GET /api/medications/:id/explain
  const explainMatch = pathname.match(/^\/api\/medications\/([^/]+)\/explain$/);
  if (method === "GET" && explainMatch) {
    const id = explainMatch[1];
    const insight = MEDICATION_INSIGHTS[id];
    if (!insight) {
      // TODO: integrate AI or pharmacological data source in production
      return Response.json({ error: "Insight not found" }, { status: 404, headers });
    }
    return Response.json(insight, { headers });
  }

  // GET /api/medications/:id
  const idMatch = pathname.match(/^\/api\/medications\/([^/]+)$/);
  if (method === "GET" && idMatch) {
    const med = MEDICATIONS.find((m) => m.id === idMatch[1]);
    if (!med) {
      return Response.json({ error: "Medication not found" }, { status: 404, headers });
    }
    return Response.json(med, { headers });
  }

  return Response.json({ error: "Not found" }, { status: 404, headers });
}
