export function corsHeaders(allowedOrigins: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": allowedOrigins,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key, Authorization, MCP-Protocol-Version, MCP-Session-Id",
  };
}

export function handlePreflight(request: Request, allowedOrigins: string): Response | null {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(allowedOrigins) });
  }
  return null;
}
