import { fetchIpfsMetadata } from "../services/ipfs.js";
import { corsHeaders } from "../utils/cors.js";

interface Env {
  ALLOWED_ORIGINS: string;
}

export async function handleFileGet(
  _request: Request,
  env: Env,
  cid: string
): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);

  try {
    const metadata = await fetchIpfsMetadata(cid);
    return new Response(JSON.stringify(metadata), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch from IPFS";
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers });
  }
}
