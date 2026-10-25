import { getAsset, listAssets } from "../services/assetStore.js";
import { MEDICATION_INSIGHTS } from "../services/insights.js";
import { corsHeaders } from "../utils/cors.js";
import type { Env } from "../index.js";

export async function handleMedications(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);

  const explainMatch = pathname.match(/^\/api\/medications\/([^/]+)\/([^/]+)\/explain$/);
  if (request.method === "GET" && explainMatch) {
    const [, orgId, recordId] = explainMatch;
    const asset = await getAsset(env.ASSETS, orgId, recordId);
    if (!asset || asset.kind !== "medication" || !asset.medication) {
      return Response.json({ error: "Medication not found" }, { status: 404, headers });
    }
    const insight = MEDICATION_INSIGHTS[recordId] ??
      Object.values(MEDICATION_INSIGHTS).find((entry) => entry.medicationName === asset.name);
    if (!insight) return Response.json({ error: "Insight not found" }, { status: 404, headers });
    return Response.json(
      { ...insight, medicationId: recordId, medicationName: asset.name },
      { headers }
    );
  }

  const medicationMatch = pathname.match(/^\/api\/medications\/([^/]+)\/([^/]+)$/);
  if (request.method === "GET" && medicationMatch) {
    const [, orgId, recordId] = medicationMatch;
    const asset = await getAsset(env.ASSETS, orgId, recordId);
    if (!asset || asset.kind !== "medication") {
      return Response.json({ error: "Medication not found" }, { status: 404, headers });
    }
    return Response.json(asset, { headers });
  }

  const orgMatch = pathname.match(/^\/api\/medications\/([^/]+)$/);
  if (request.method === "GET" && orgMatch) {
    const orgId = orgMatch[1];
    const recipientId = new URL(request.url).searchParams.get("recipientId");
    const medications = (await listAssets(env.ASSETS, orgId))
      .filter((asset) => asset.kind === "medication" && asset.medication)
      .filter((asset) => !recipientId || asset.medication?.recipientId === recipientId);
    return Response.json(medications, { headers });
  }

  return Response.json({ error: "Not found" }, { status: 404, headers });
}
