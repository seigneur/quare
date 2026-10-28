import { getAsset, listAssets, putAsset, type AssetMeta } from "./assetStore.js";
import { expandSchedule } from "./schedule.js";
import type { DoseOccurrence, DoseStatus } from "./medicationTypes.js";
import type { Env } from "../index.js";

export type DoseSource = "web" | "qr" | "mcp" | "alexa" | "telegram";

interface DoseRow {
  id: string;
  org_id: string;
  record_id: string;
  recipient_id: string;
  scheduled_at: string;
  status: DoseStatus;
  taken_at: string | null;
  notes: string | null;
}

export interface DoseFilters {
  from: string;
  to: string;
  recipientId?: string;
  status?: DoseStatus;
}

function toOccurrence(row: DoseRow, asset: AssetMeta | null): DoseOccurrence {
  return {
    id: row.id,
    medicationId: row.record_id,
    recipientId: row.recipient_id,
    medicationName: asset?.name ?? "Deleted medication",
    medicationColor: asset?.medication?.color ?? "blue",
    dosage: asset?.medication?.dosage ?? "",
    scheduledAt: row.scheduled_at,
    status: row.status,
    ...(row.taken_at ? { takenAt: row.taken_at } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}

export async function materializeDoses(
  orgId: string,
  env: Pick<Env, "DB" | "ASSETS">,
  horizonHours = 36
): Promise<void> {
  if (!Number.isFinite(horizonHours) || horizonHours <= 0) {
    throw new RangeError("horizonHours must be positive");
  }
  const now = new Date();
  const until = new Date(now.getTime() + horizonHours * 3_600_000);
  const assets = await listAssets(env.ASSETS, orgId);
  const statements: D1PreparedStatement[] = [];
  const expected = new Set<string>();
  for (const asset of assets) {
    if (asset.kind !== "medication" || !asset.medication?.active || asset.status === "Disposed") {
      continue;
    }
    for (const scheduledAt of expandSchedule(asset.medication, now, until)) {
      expected.add(JSON.stringify([asset.recordId, asset.medication.recipientId, scheduledAt.toISOString()]));
      statements.push(env.DB.prepare(
        `INSERT OR IGNORE INTO doses
          (id, org_id, record_id, recipient_id, scheduled_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
      ).bind(
        crypto.randomUUID(), orgId, asset.recordId, asset.medication.recipientId,
        scheduledAt.toISOString(), now.toISOString(), now.toISOString()
      ));
    }
  }
  const pending = await env.DB.prepare(
    `SELECT * FROM doses WHERE org_id = ? AND status = 'pending'
     AND scheduled_at >= ? AND scheduled_at < ?`
  ).bind(orgId, now.toISOString(), until.toISOString()).all<DoseRow>();
  const deletions: D1PreparedStatement[] = [];
  for (const row of pending.results) {
    if (!expected.has(JSON.stringify([row.record_id, row.recipient_id, row.scheduled_at]))) {
      deletions.push(env.DB.prepare(
        "DELETE FROM doses WHERE org_id = ? AND id = ? AND status = 'pending'"
      ).bind(orgId, row.id));
    }
  }
  const changes = [...deletions, ...statements];
  for (let offset = 0; offset < changes.length; offset += 100) {
    await env.DB.batch(changes.slice(offset, offset + 100));
  }
}

function filterQuery(orgId: string, filters: DoseFilters) {
  const clauses = ["org_id = ?", "scheduled_at >= ?", "scheduled_at < ?"];
  const values: string[] = [orgId, filters.from, filters.to];
  if (filters.recipientId !== undefined) {
    clauses.push("recipient_id = ?");
    values.push(filters.recipientId);
  }
  if (filters.status !== undefined) {
    clauses.push("status = ?");
    values.push(filters.status);
  }
  return { where: clauses.join(" AND "), values };
}

export async function listDoses(
  orgId: string,
  env: Env,
  filters: DoseFilters
): Promise<DoseOccurrence[]> {
  const { where, values } = filterQuery(orgId, filters);
  const { results } = await env.DB.prepare(
    `SELECT * FROM doses WHERE ${where} ORDER BY scheduled_at, id`
  ).bind(...values).all<DoseRow>();
  const assets = new Map<string, AssetMeta | null>();
  for (const recordId of new Set(results.map((row) => row.record_id))) {
    assets.set(recordId, await getAsset(env.ASSETS, orgId, recordId));
  }
  return results.map((row) => toOccurrence(row, assets.get(row.record_id) ?? null));
}

export async function resetMedicationStock(asset: AssetMeta, db: D1Database): Promise<void> {
  if (asset.medication?.stock) {
    await db.prepare(
      `INSERT INTO medication_stock (record_id, org_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT(record_id) DO UPDATE SET quantity = excluded.quantity, needs_sync = 1`
    ).bind(asset.recordId, asset.orgId, asset.medication.stock.quantity).run();
  } else {
    await db.prepare(
      "DELETE FROM medication_stock WHERE org_id = ? AND record_id = ?"
    ).bind(asset.orgId, asset.recordId).run();
  }
}

export async function reconcileStock(
  orgId: string,
  env: Pick<Env, "DB" | "ASSETS" | "BATCH_QUEUE">,
  recordId?: string
): Promise<void> {
  const query = env.DB.prepare(
    `SELECT record_id, quantity FROM medication_stock
     WHERE org_id = ? AND needs_sync = 1${recordId ? " AND record_id = ?" : ""}`
  );
  const { results } = await (recordId ? query.bind(orgId, recordId) : query.bind(orgId))
    .all<{ record_id: string; quantity: number }>();
  for (const stock of results) {
    const asset = await getAsset(env.ASSETS, orgId, stock.record_id);
    if (asset?.kind !== "medication" || !asset.medication?.stock) continue;
    asset.medication.stock.quantity = stock.quantity;
    asset.updatedAt = new Date().toISOString();
    await putAsset(env.ASSETS, env.BATCH_QUEUE, asset);
    // Clear only the projected value; a concurrent change still needs a retry.
    await env.DB.prepare(
      `UPDATE medication_stock SET needs_sync = CASE WHEN quantity = ? THEN 0 ELSE 1 END
       WHERE org_id = ? AND record_id = ?`
    ).bind(stock.quantity, orgId, stock.record_id).run();
  }
}

export async function setDoseStatus(
  orgId: string,
  env: Env,
  id: string,
  status: DoseStatus,
  source: DoseSource,
  notes?: string
): Promise<DoseOccurrence | null> {
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    "SELECT * FROM doses WHERE org_id = ? AND id = ?"
  ).bind(orgId, id).first<DoseRow>();
  if (!existing) return null;
  const asset = await getAsset(env.ASSETS, orgId, existing.record_id);
  const statements: D1PreparedStatement[] = [];
  if (asset?.kind === "medication" && asset.medication?.stock) {
    statements.push(env.DB.prepare(
      "INSERT OR IGNORE INTO medication_stock (record_id, org_id, quantity) VALUES (?, ?, ?)"
    ).bind(asset.recordId, orgId, asset.medication.stock.quantity));
  }
  // Triggers update inventory in this same transaction, including corrections.
  statements.push(env.DB.prepare(
    `UPDATE doses SET status = ?, source = ?, notes = COALESCE(?, notes),
       taken_at = CASE WHEN ? = 'taken' THEN COALESCE(taken_at, ?) ELSE NULL END,
       updated_at = ? WHERE org_id = ? AND id = ? RETURNING *`
  ).bind(status, source, notes ?? null, status, now, now, orgId, id));
  const result = await env.DB.batch<DoseRow>(statements);
  const row = result[result.length - 1].results[0];
  await reconcileStock(orgId, env, existing.record_id);
  return toOccurrence(row, asset);
}

export async function markMissed(
  orgId: string,
  env: Env,
  graceMinutes = 60
): Promise<void> {
  if (!Number.isFinite(graceMinutes) || graceMinutes < 0) {
    throw new RangeError("graceMinutes must be non-negative");
  }
  const now = new Date();
  await env.DB.prepare(
    `UPDATE doses SET status = 'missed', updated_at = ?
     WHERE org_id = ? AND status = 'pending' AND scheduled_at < ?`
  ).bind(
    now.toISOString(), orgId, new Date(now.getTime() - graceMinutes * 60_000).toISOString()
  ).run();
}

export async function getAdherence(orgId: string, env: Env, filters: DoseFilters) {
  const { where, values } = filterQuery(orgId, filters);
  const counts = await env.DB.prepare(
    `SELECT COALESCE(SUM(status = 'taken'), 0) AS taken,
       COALESCE(SUM(status = 'missed'), 0) AS missed
     FROM doses WHERE ${where}`
  ).bind(...values).first<{ taken: number; missed: number }>();
  const taken = counts?.taken ?? 0;
  const missed = counts?.missed ?? 0;
  return { taken, missed, adherence: taken + missed ? taken / (taken + missed) : null };
}
