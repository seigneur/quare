const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface StoreResult {
  pin: string;
}

export async function storeDocument(data: Record<string, unknown>): Promise<StoreResult> {
  const res = await fetch(`${API_BASE}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Store failed: ${res.status}`);
  return res.json() as Promise<StoreResult>;
}

export async function retrieveDocument(pin: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/documents/${pin}`);
  if (!res.ok) throw new Error(`Retrieve failed: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}
