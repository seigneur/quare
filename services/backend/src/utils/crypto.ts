const ITERATIONS = 600_000;
const KEY_LENGTH = 32; // 256 bits -> 64 hex chars

export async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: ITERATIONS },
    keyMaterial,
    KEY_LENGTH * 8
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function comparePin(
  pin: string,
  salt: string,
  storedHash: string
): Promise<boolean> {
  const derived = await hashPin(pin, salt);
  // constant-time comparison
  if (derived.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) {
    diff |= derived.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}
