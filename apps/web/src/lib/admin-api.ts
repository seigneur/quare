const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function adminFetch(path: string, adminKey: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
      ...options?.headers,
    },
  });
  return res;
}

export interface AdminRecord {
  cid: string | null;
  orgId: string | null;
  revoked: boolean;
  hasSecrets: boolean;
}

export async function adminGetRecord(id: string, adminKey: string): Promise<AdminRecord> {
  const res = await adminFetch(`/admin/records/${id}`, adminKey);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<AdminRecord>;
}

export async function adminStoreSecrets(
  recordId: string,
  salt: string,
  iv: string,
  adminKey: string
): Promise<void> {
  const res = await adminFetch("/admin/records", adminKey, {
    method: "POST",
    body: JSON.stringify({ recordId, salt, iv }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

export async function adminRevokeRecord(id: string, adminKey: string): Promise<void> {
  const res = await adminFetch(`/admin/records/${id}/revoke`, adminKey, { method: "POST" });
  if (!res.ok) throw new Error(`${res.status}`);
}
