import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Env } from "../index.js";
import { authenticateToken } from "../services/mcpTokens.js";
import { createMcpServer } from "../services/mcpTools.js";
import { corsHeaders } from "../utils/cors.js";

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  const headers = corsHeaders(env.ALLOWED_ORIGINS);
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
  if (origin && !allowed.includes("*") && !allowed.includes(origin)) {
    return Response.json({ error: "Origin not allowed" }, { status: 403, headers });
  }
  const grant = await authenticateToken(request, env.RECORD_SECRETS);
  if (!grant) {
    return Response.json({ error: "Unauthorized" }, {
      status: 401, headers: { ...headers, "WWW-Authenticate": "Bearer" },
    });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
  }
  const server = createMcpServer(env, grant);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    const responseHeaders = new Headers(response.headers);
    new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
    return new Response(response.body, {
      status: response.status, headers: responseHeaders,
    });
  } finally {
    await server.close();
  }
}
