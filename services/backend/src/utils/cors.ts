export function corsHeaders(allowedOrigins: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": allowedOrigins,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
  };
}

export function handlePreflight(request: Request, allowedOrigins: string): Response | null {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(allowedOrigins) });
  }
  return null;
}
