import { handlePreflight, corsHeaders } from "./utils/cors.js";
import { handlePinVerify } from "./routes/pin.js";
import { handleFileGet } from "./routes/files.js";
import { handleAdmin } from "./routes/admin.js";

export interface Env {
  CONTRACT_ADDRESS: string;
  CHAIN_RPC_URL: string;
  ALLOWED_ORIGINS: string;
  RECORD_SECRETS: KVNamespace;
  ADMIN_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const preflight = handlePreflight(request, env.ALLOWED_ORIGINS);
    if (preflight) return preflight;

    const url = new URL(request.url);
    const { pathname, method } = url;

    // /admin/* routes
    if (pathname.startsWith("/admin/")) {
      return handleAdmin(request, env, pathname);
    }

    // POST /pin/verify
    if (method === "POST" && pathname === "/pin/verify") {
      return handlePinVerify(request, env);
    }

    // GET /files/:cid
    const filesMatch = pathname.match(/^\/files\/(.+)$/);
    if (method === "GET" && filesMatch) {
      return handleFileGet(request, env, filesMatch[1]);
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: corsHeaders(env.ALLOWED_ORIGINS),
    });
  },
};
