import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAsset, putAsset, type AssetMeta } from "../../src/services/assetStore.js";
import {
  getAdherence,
  listDoses,
  markMissed,
  materializeDoses,
  setDoseStatus,
} from "../../src/services/doseStore.js";
import { makeEnv, type TestEnv } from "../helpers/env.js";
import { SQLiteD1 } from "../helpers/d1.js";

const NOW = "2026-03-16T07:00:00.000Z";
const RANGE = { from: "2026-03-15T00:00:00.000Z", to: "2026-03-20T00:00:00.000Z" };

describe("persistent dose store", () => {
  let env: TestEnv;
  let database: SQLiteD1;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    database = new SQLiteD1();
    env = makeEnv({ DB: database as unknown as TestEnv["DB"] });
  });

  afterEach(() => {
    database.close();
    vi.useRealTimers();
  });

  async function medication(
    recordId = "med-1",
    orgId = "org1",
    recipientId = "recipient-1",
    overrides: Partial<AssetMeta> = {}
  ): Promise<AssetMeta> {
    const asset: AssetMeta = {
      recordId,
      orgId,
      name: "Lisinopril",
      status: "In use",
      location: "",
      assignee: recipientId,
      category: "Medication",
      fields: {},
      files: [],
      kind: "medication",
      medication: {
        recipientId,
        dosage: "10 mg",
        form: "Tablet",
        color: "blue",
        schedule: { type: "daily", times: ["08:00", "20:00"] },
        startDate: "2026-03-01",
        timezone: "UTC",
        stock: { quantity: 10, unit: "tablets" },
        active: true,
      },
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
    await putAsset(env.ASSETS, env.BATCH_QUEUE, asset);
    return asset;
  }

  it("uses real SQLite constraints, D1 metadata, and atomic batches", async () => {
    const insert = (id: string) => database.prepare(
      `INSERT INTO doses
       (id, org_id, record_id, recipient_id, scheduled_at, created_at, updated_at)
       VALUES (?, 'org1', 'med-1', 'recipient-1', ?, ?, ?)`
    ).bind(id, id, NOW, NOW);
    const inserted = await insert("dose-1").run();
    expect(inserted).toMatchObject({
      success: true,
      results: [],
      meta: { changes: 1, changed_db: true, rows_written: 1 },
    });
    const unchanged = await database.prepare(
      "UPDATE doses SET status = 'taken' WHERE id = 'missing'"
    ).run();
    expect(unchanged.meta.changes).toBe(0);
    await expect(database.batch([insert("dose-2"), insert("dose-1")])).rejects.toThrow();
    expect(await database.prepare("SELECT COUNT(*) AS count FROM doses").first<number>("count"))
      .toBe(1);
    expect(await database.prepare("SELECT * FROM doses WHERE id = ?").bind("missing").first())
      .toBeNull();
    expect((await database.prepare("SELECT * FROM doses").all()).results).toHaveLength(1);
    expect(await database.exec("UPDATE doses SET notes = 'verified'; SELECT 1;"))
      .toEqual({ count: 2, duration: 0 });
    expect(await database.prepare("SELECT notes FROM doses").first("notes")).toBe("verified");
  });

  it("materializes a rolling 36-hour horizon idempotently and hydrates medication details", async () => {
    await medication();
    await materializeDoses("org1", env);
    const first = await listDoses("org1", env, RANGE);
    expect(first.map((dose) => dose.scheduledAt)).toEqual([
      "2026-03-16T08:00:00.000Z",
      "2026-03-16T20:00:00.000Z",
      "2026-03-17T08:00:00.000Z",
    ]);
    expect(first[0]).toMatchObject({
      medicationId: "med-1",
      recipientId: "recipient-1",
      medicationName: "Lisinopril",
      medicationColor: "blue",
      dosage: "10 mg",
      status: "pending",
    });
    await materializeDoses("org1", env);
    expect(await listDoses("org1", env, RANGE)).toEqual(first);
    vi.setSystemTime(new Date("2026-03-16T19:00:00.000Z"));
    await materializeDoses("org1", env);
    const extended = await listDoses("org1", env, RANGE);
    expect(extended).toHaveLength(4);
    expect(extended[0].id).toBe(first[0].id);
    expect(extended.at(-1)?.scheduledAt).toBe("2026-03-17T20:00:00.000Z");
  });

  it("ignores inactive, disposed, generic, and other-organization assets", async () => {
    const active = await medication();
    await medication("inactive", "org1", "recipient-1", {
      medication: { ...active.medication!, active: false },
    });
    await medication("disposed", "org1", "recipient-1", { status: "Disposed" });
    await medication("generic", "org1", "recipient-1", { kind: "generic", medication: undefined });
    await medication("foreign", "org2");
    await materializeDoses("org1", env);
    expect((await listDoses("org1", env, RANGE)).map((dose) => dose.medicationId))
      .toEqual(["med-1", "med-1", "med-1"]);
    expect(await listDoses("org2", env, RANGE)).toEqual([]);
  });

  it("filters by date, recipient, status, and organization in chronological order", async () => {
    await medication();
    await medication("med-2", "org1", "recipient-2");
    await medication("foreign", "org2");
    await materializeDoses("org1", env);
    await materializeDoses("org2", env);
    const doses = await listDoses("org1", env, { ...RANGE, recipientId: "recipient-1" });
    await setDoseStatus("org1", env, doses[0].id, "taken", "web");
    expect(await listDoses("org1", env, {
      from: "2026-03-16T08:00:00.000Z",
      to: "2026-03-16T20:00:00.000Z",
      recipientId: "recipient-1",
      status: "taken",
    })).toEqual([expect.objectContaining({ id: doses[0].id, status: "taken" })]);
    expect(await listDoses("org1", env, { ...RANGE, recipientId: "missing" })).toEqual([]);
    expect(await listDoses("org2", env, { ...RANGE, status: "taken" })).toEqual([]);
    expect((await listDoses("org1", env, { ...RANGE, status: "pending" }))).toHaveLength(5);
  });

  it("persists status, source, timestamp, notes, stock changes, and the dirty queue", async () => {
    await medication();
    await materializeDoses("org1", env);
    await env.BATCH_QUEUE.delete("org1:batch:pending");
    const [dose] = await listDoses("org1", env, RANGE);
    const updated = await setDoseStatus("org1", env, dose.id, "taken", "qr", "With breakfast");
    expect(updated).toMatchObject({
      id: dose.id,
      status: "taken",
      takenAt: NOW,
      notes: "With breakfast",
    });
    expect(await env.DB.prepare("SELECT source FROM doses WHERE id = ?").bind(dose.id).first("source"))
      .toBe("qr");
    expect((await getAsset(env.ASSETS, "org1", "med-1"))?.medication?.stock?.quantity).toBe(9);
    expect(JSON.parse((await env.BATCH_QUEUE.get("org1:batch:pending")) ?? "[]")).toEqual(["med-1"]);
    expect((await listDoses("org1", env, RANGE))[0]).toEqual(updated);
    expect(await setDoseStatus("org2", env, dose.id, "taken", "web")).toBeNull();
    expect(await setDoseStatus("org1", env, "missing", "taken", "web")).toBeNull();
  });

  it("does not decrement stock for other statuses or repeated and concurrent identical taken requests", async () => {
    await medication();
    await materializeDoses("org1", env);
    const [dose] = await listDoses("org1", env, RANGE);
    await setDoseStatus("org1", env, dose.id, "skipped", "web");
    expect((await getAsset(env.ASSETS, "org1", "med-1"))?.medication?.stock?.quantity).toBe(10);
    const requests = await Promise.all([
      setDoseStatus("org1", env, dose.id, "taken", "web"),
      setDoseStatus("org1", env, dose.id, "taken", "web"),
      setDoseStatus("org1", env, dose.id, "taken", "web"),
    ]);
    expect(requests.every((result) => result?.status === "taken")).toBe(true);
    vi.setSystemTime(new Date("2026-03-16T07:10:00.000Z"));
    const repeated = await setDoseStatus("org1", env, dose.id, "taken", "web");
    expect(repeated?.takenAt).toBe(NOW);
    expect((await getAsset(env.ASSETS, "org1", "med-1"))?.medication?.stock?.quantity).toBe(9);
  });

  it("never decrements stock below zero and supports medications without stock", async () => {
    const asset = await medication();
    await medication("empty", "org1", "recipient-1", {
      medication: { ...asset.medication!, stock: { quantity: 0, unit: "tablets" } },
    });
    await medication("untracked", "org1", "recipient-2", {
      medication: { ...asset.medication!, stock: undefined },
    });
    await materializeDoses("org1", env);
    for (const id of ["empty", "untracked"]) {
      const dose = (await listDoses("org1", env, RANGE)).find((item) => item.medicationId === id)!;
      expect((await setDoseStatus("org1", env, dose.id, "taken", "web"))?.status).toBe("taken");
    }
    expect((await getAsset(env.ASSETS, "org1", "empty"))?.medication?.stock?.quantity).toBe(0);
    expect((await getAsset(env.ASSETS, "org1", "untracked"))?.medication?.stock).toBeUndefined();
  });

  it("counts concurrent taken transitions for different doses of the same medication", async () => {
    await medication();
    await materializeDoses("org1", env);
    const doses = await listDoses("org1", env, RANGE);
    await Promise.all(doses.map((dose) => setDoseStatus("org1", env, dose.id, "taken", "web")));
    expect((await listDoses("org1", env, RANGE)).every((dose) => dose.status === "taken"))
      .toBe(true);
    expect((await getAsset(env.ASSETS, "org1", "med-1"))?.medication?.stock?.quantity)
      .toBe(10 - doses.length);
    expect(JSON.parse((await env.BATCH_QUEUE.get("org1:batch:pending")) ?? "[]")).toEqual(["med-1"]);
  });

  it("marks only pending doses beyond the grace period and leaves other organizations unchanged", async () => {
    await medication();
    await medication("other", "org2");
    await materializeDoses("org1", env);
    await materializeDoses("org2", env);
    const doses = await listDoses("org1", env, RANGE);
    await setDoseStatus("org1", env, doses[1].id, "skipped", "web");
    vi.setSystemTime(new Date("2026-03-16T09:00:00.000Z"));
    await markMissed("org1", env);
    expect((await listDoses("org1", env, RANGE))[0].status).toBe("pending");
    vi.setSystemTime(new Date("2026-03-16T09:00:00.001Z"));
    await markMissed("org1", env);
    expect((await listDoses("org1", env, RANGE)).map((dose) => dose.status))
      .toEqual(["missed", "skipped", "pending"]);
    expect((await listDoses("org2", env, RANGE))[0].status).toBe("pending");
    vi.setSystemTime(new Date("2026-03-17T08:30:00.001Z"));
    await markMissed("org1", env, 30);
    expect((await listDoses("org1", env, RANGE)).map((dose) => dose.status))
      .toEqual(["missed", "skipped", "missed"]);
  });

  it("calculates adherence from taken and missed only, honoring date, recipient, and organization", async () => {
    await medication();
    await medication("med-2", "org1", "recipient-2");
    await medication("other", "org2");
    await materializeDoses("org1", env);
    await materializeDoses("org2", env);
    const first = await listDoses("org1", env, { ...RANGE, recipientId: "recipient-1" });
    const second = await listDoses("org1", env, { ...RANGE, recipientId: "recipient-2" });
    await setDoseStatus("org1", env, first[0].id, "taken", "web");
    await setDoseStatus("org1", env, first[1].id, "missed", "web");
    await setDoseStatus("org1", env, first[2].id, "skipped", "web");
    await setDoseStatus("org1", env, second[0].id, "taken", "web");
    await setDoseStatus("org1", env, second[1].id, "rescheduled", "web");
    expect(await getAdherence("org1", env, RANGE)).toEqual({
      taken: 2, missed: 1, adherence: 2 / 3,
    });
    expect(await getAdherence("org1", env, { ...RANGE, recipientId: "recipient-1" }))
      .toEqual({ taken: 1, missed: 1, adherence: 0.5 });
    expect(await getAdherence("org1", env, {
      from: "2026-03-16T20:00:00.000Z", to: RANGE.to,
    })).toEqual({ taken: 0, missed: 1, adherence: 0 });
    expect(await getAdherence("org2", env, RANGE)).toEqual({
      taken: 0, missed: 0, adherence: null,
    });
    expect(await getAdherence("org1", env, { ...RANGE, recipientId: "missing" })).toEqual({
      taken: 0, missed: 0, adherence: null,
    });
  });
});
