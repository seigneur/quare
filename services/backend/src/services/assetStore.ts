import type { MedicationDetails } from "./medicationTypes.js";

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
  kind?: "generic" | "medication";
  medication?: MedicationDetails;
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

export async function putAssets(
  assets: KVNamespace,
  queue: KVNamespace,
  orgId: string,
  records: AssetMeta[]
): Promise<void> {
  if (records.some((asset) => asset.orgId !== orgId)) throw new Error("Organization mismatch");
  const saved: string[] = [];
  try {
    for (const asset of records) {
      await assets.put(`${orgId}:asset:${asset.recordId}`, JSON.stringify(asset));
      saved.push(asset.recordId);
    }
  } finally {
    if (saved.length) {
      const key = `${orgId}:batch:pending`;
      const raw = await queue.get(key);
      const pending: string[] = raw ? JSON.parse(raw) as string[] : [];
      await queue.put(key, JSON.stringify([...new Set([...pending, ...saved])]));
    }
  }
}

export async function listAssets(
  assets: KVNamespace,
  orgId: string
): Promise<AssetMeta[]> {
  const results: AssetMeta[] = [];
  let cursor: string | undefined;
  do {
    const page = await assets.list({ prefix: `${orgId}:asset:`, cursor });
    const values = await Promise.all(
      page.keys.map(async (key) => {
        const value = await assets.get(key.name);
        return value ? JSON.parse(value) as AssetMeta : null;
      })
    );
    results.push(...values.filter((asset): asset is AssetMeta => asset !== null));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return results;
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
