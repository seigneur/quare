export interface AssetMeta {
  recordId: string;
  orgId: string;
  name: string;
  status: "Deployed" | "In use" | "Maintenance" | "Spare" | "Disposed";
  location: string;
  assignee: string;
  category: string;
  fields: Record<string, string | number>;
  files: Array<{ name: string; cid: string; encrypted: boolean; size: number }>;
  createdAt: string;
  updatedAt: string;
  ipfsCID?: string;
}

export async function getAsset(
  assets: KVNamespace,
  orgId: string,
  recordId: string
): Promise<AssetMeta | null> {
  const value = await assets.get(`${orgId}:asset:${recordId}`);
  if (value === null) return null;
  return JSON.parse(value) as AssetMeta;
}

export async function putAsset(
  assets: KVNamespace,
  queue: KVNamespace,
  asset: AssetMeta
): Promise<void> {
  await assets.put(`${asset.orgId}:asset:${asset.recordId}`, JSON.stringify(asset));

  const existing = await queue.get(`${asset.orgId}:batch:pending`);
  const pending: string[] = existing ? (JSON.parse(existing) as string[]) : [];
  if (!pending.includes(asset.recordId)) {
    pending.push(asset.recordId);
  }
  await queue.put(`${asset.orgId}:batch:pending`, JSON.stringify(pending));
}

export async function listAssets(
  assets: KVNamespace,
  orgId: string
): Promise<AssetMeta[]> {
  const list = await assets.list({ prefix: `${orgId}:asset:` });
  const results = await Promise.all(
    list.keys.map(async (k) => {
      const value = await assets.get(k.name);
      return value ? (JSON.parse(value) as AssetMeta) : null;
    })
  );
  return results.filter((a): a is AssetMeta => a !== null);
}

export async function getPendingBatch(
  queue: KVNamespace,
  orgId: string
): Promise<string[]> {
  const value = await queue.get(`${orgId}:batch:pending`);
  if (value === null) return [];
  return JSON.parse(value) as string[];
}

export async function clearPendingBatch(
  queue: KVNamespace,
  orgId: string
): Promise<void> {
  await queue.delete(`${orgId}:batch:pending`);
}
