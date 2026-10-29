import { z } from "zod";

export const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const tokenGrantSchema = z.strictObject({
  orgId: identifier,
  scopes: z.array(z.enum(["read", "write"])).min(1),
});
export type TokenGrant = z.infer<typeof tokenGrantSchema>;

export async function hashToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createToken(
  secrets: KVNamespace,
  grant: TokenGrant
): Promise<{ token: string; tokenId: string }> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenId = await hashToken(token);
  await secrets.put(`mcp:token:${tokenId}`, JSON.stringify(grant));
  return { token, tokenId };
}

export async function authenticateToken(
  request: Request,
  secrets: KVNamespace
): Promise<TokenGrant | null> {
  const [scheme, token, extra] = (request.headers.get("Authorization") ?? "").split(/\s+/);
  if (scheme.toLowerCase() !== "bearer" || !token || extra || token.length > 512) return null;
  const value = await secrets.get(`mcp:token:${await hashToken(token)}`);
  if (!value) return null;
  try {
    const parsed = tokenGrantSchema.safeParse(JSON.parse(value) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
