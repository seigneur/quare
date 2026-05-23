export async function storeSecrets(
  kv: KVNamespace,
  recordId: string,
  salt: string,
  iv: string
): Promise<void> {
  await kv.put(`secrets:${recordId}`, JSON.stringify({ salt, iv }));
}

export async function getSecrets(
  kv: KVNamespace,
  recordId: string
): Promise<{ salt: string; iv: string } | null> {
  const value = await kv.get(`secrets:${recordId}`);
  if (value === null) return null;
  return JSON.parse(value) as { salt: string; iv: string };
}

export async function deleteSecrets(
  kv: KVNamespace,
  recordId: string
): Promise<void> {
  await kv.delete(`secrets:${recordId}`);
}
