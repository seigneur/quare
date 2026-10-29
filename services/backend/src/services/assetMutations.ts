import { getAsset, putAsset, putAssets, type AssetMeta } from "./assetStore.js";
import { materializeDoses, reconcileStock, resetMedicationStock } from "./doseStore.js";
import type { Env } from "../index.js";

type MutationEnv = Pick<Env, "DB" | "ASSETS" | "BATCH_QUEUE">;

export async function saveNewAssets(env: MutationEnv, orgId: string, assets: AssetMeta[]): Promise<void> {
  if (assets.some((asset) => asset.kind === "medication")) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO medication_orgs (org_id) VALUES (?)"
    ).bind(orgId).run();
  }
  await putAssets(env.ASSETS, env.BATCH_QUEUE, orgId, assets);
  for (const asset of assets) {
    if (asset.kind === "medication") await resetMedicationStock(asset, env.DB);
  }
}

export async function saveAsset(
  env: MutationEnv,
  asset: AssetMeta,
  existing?: AssetMeta
): Promise<AssetMeta> {
  const { orgId, recordId } = asset;
  if (!existing) {
    await saveNewAssets(env, orgId, [asset]);
    return asset;
  }
  if (asset.kind === "medication") {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO medication_orgs (org_id) VALUES (?)"
    ).bind(orgId).run();
  }
  await putAsset(env.ASSETS, env.BATCH_QUEUE, asset);
  let result = asset;
  if (existing.kind === "medication" || asset.kind === "medication") {
    if (asset.kind !== "medication" ||
      asset.medication?.stock?.quantity !== existing.medication?.stock?.quantity) {
      await resetMedicationStock(asset, env.DB);
    } else {
      await reconcileStock(orgId, env, recordId);
      result = await getAsset(env.ASSETS, orgId, recordId) ?? asset;
    }
    const before = existing.medication;
    const after = asset.medication;
    if (existing.kind !== asset.kind ||
      (existing.status === "Disposed") !== (asset.status === "Disposed") ||
      before?.active !== after?.active || before?.recipientId !== after?.recipientId ||
      before?.startDate !== after?.startDate || before?.endDate !== after?.endDate ||
      before?.timezone !== after?.timezone ||
      JSON.stringify(before?.schedule) !== JSON.stringify(after?.schedule)) {
      await env.DB.prepare(
        `DELETE FROM doses WHERE org_id = ? AND record_id = ?
         AND status = 'pending' AND scheduled_at >= ?`
      ).bind(orgId, recordId, new Date().toISOString()).run();
      await materializeDoses(orgId, env);
    }
  }
  return result;
}
