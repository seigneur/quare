import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index.js";
import { getAsset, type AssetMeta } from "../../src/services/assetStore.js";
import { processBatch } from "../../src/services/batchProcessor.js";
import { listDoses, setDoseStatus } from "../../src/services/doseStore.js";
import { SQLiteD1 } from "../helpers/d1.js";
import { makeEnv, type TestEnv } from "../helpers/env.js";

vi.mock("../../src/services/batchProcessor.js", () => ({
  processBatch: vi.fn(async () => {}),
}));

const NOW = "2026-03-16T07:00:00.000Z";
const RANGE = { from: "2026-03-16T00:00:00.000Z", to: "2026-03-18T00:00:00.000Z" };
const event = (cron: string) => ({
  cron,
  scheduledTime: Date.now(),
  noRetry() {},
}) as ScheduledEvent;

describe("dose scheduling cron", () => {
  let env: TestEnv;
  let database: SQLiteD1;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    vi.mocked(processBatch).mockClear();
    database = new SQLiteD1();
    env = makeEnv({ DB: database as unknown as TestEnv["DB"] });
  });

  afterEach(() => {
    database.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function medication(orgId: string, recordId: string) {
    const asset: AssetMeta = {
      orgId,
      recordId,
      name: "Lisinopril",
      status: "In use",
      location: "",
      assignee: "recipient-1",
      category: "Medication",
      fields: {},
      files: [],
      kind: "medication",
      medication: {
        recipientId: "recipient-1",
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
    };
    await env.ASSETS.put(`${orgId}:asset:${recordId}`, JSON.stringify(asset));
    await env.DB.prepare(
      "INSERT OR IGNORE INTO medication_orgs (org_id) VALUES (?)"
    ).bind(orgId).run();
  }

  it("materializes all medication organizations every minute and marks overdue doses missed", async () => {
    await medication("org1", "med-1");
    await medication("org2", "med-2");
    await env.BATCH_QUEUE.put("org1:batch:pending", JSON.stringify(["med-1"]));
    await worker.scheduled(event("* * * * *"), env);
    for (const orgId of ["org1", "org2"]) {
      expect(await listDoses(orgId, env, RANGE)).toHaveLength(3);
    }
    const initial = await listDoses("org1", env, RANGE);
    await worker.scheduled(event("* * * * *"), env);
    expect(await listDoses("org1", env, RANGE)).toEqual(initial);
    vi.setSystemTime(new Date("2026-03-16T09:01:00.000Z"));
    await worker.scheduled(event("* * * * *"), env);
    for (const orgId of ["org1", "org2"]) {
      const doses = await listDoses(orgId, env, RANGE);
      expect(doses[0].status).toBe("missed");
      expect(doses.slice(1).every((dose) => dose.status === "pending")).toBe(true);
    }
    expect(processBatch).not.toHaveBeenCalled();
    expect(await env.BATCH_QUEUE.get("org1:batch:pending")).toBe(JSON.stringify(["med-1"]));
  });

  it("uses the medication-org index without listing unrelated organizations or unprefixed KV keys", async () => {
    await medication("org1", "med-1");
    await medication("org2", "med-2");
    await env.ASSETS.put("generic-org:asset:laptop", JSON.stringify({
      orgId: "generic-org", recordId: "laptop", kind: "generic",
    }));
    const originalList = env.ASSETS.list.bind(env.ASSETS);
    const list = vi.spyOn(env.ASSETS, "list").mockImplementation(async (options) => {
      if (!options?.prefix) throw new Error("Unprefixed KV discovery is forbidden");
      return originalList(options);
    });
    const get = vi.spyOn(env.ASSETS, "get");
    await worker.scheduled(event("* * * * *"), env);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ prefix: "org1:asset:" }));
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ prefix: "org2:asset:" }));
    expect(get).not.toHaveBeenCalledWith("generic-org:asset:laptop");
    expect(await listDoses("org1", env, RANGE)).toHaveLength(3);
    expect(await listDoses("org2", env, RANGE)).toHaveLength(3);
  });

  it("does not read KV when the medication-org index is empty", async () => {
    const list = vi.spyOn(env.ASSETS, "list");
    const get = vi.spyOn(env.ASSETS, "get");
    await worker.scheduled(event("* * * * *"), env);
    expect(list).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("reconciles stock projections on the next minute after a transient KV failure", async () => {
    await medication("org1", "med-1");
    await worker.scheduled(event("* * * * *"), env);
    const [dose] = await listDoses("org1", env, RANGE);
    vi.spyOn(env.ASSETS, "put").mockRejectedValueOnce(new Error("KV temporarily unavailable"));
    await expect(setDoseStatus("org1", env, dose.id, "taken", "web"))
      .rejects.toThrow("KV temporarily unavailable");
    expect((await getAsset(env.ASSETS, "org1", "med-1"))?.medication?.stock?.quantity).toBe(10);
    await worker.scheduled(event("* * * * *"), env);
    expect((await getAsset(env.ASSETS, "org1", "med-1"))?.medication?.stock?.quantity).toBe(9);
    expect((await listDoses("org1", env, RANGE))[0].status).toBe("taken");
    expect(JSON.parse((await env.BATCH_QUEUE.get("org1:batch:pending")) ?? "[]")).toEqual(["med-1"]);
  });

  it("retries a failed dirty-queue write on the next minute without deducting stock again", async () => {
    await medication("org1", "med-1");
    await worker.scheduled(event("* * * * *"), env);
    const [dose] = await listDoses("org1", env, RANGE);
    vi.spyOn(env.BATCH_QUEUE, "put").mockRejectedValueOnce(new Error("Queue temporarily unavailable"));
    await expect(setDoseStatus("org1", env, dose.id, "taken", "web"))
      .rejects.toThrow("Queue temporarily unavailable");
    expect((await getAsset(env.ASSETS, "org1", "med-1"))?.medication?.stock?.quantity).toBe(9);
    expect(await env.BATCH_QUEUE.get("org1:batch:pending")).toBeNull();
    vi.setSystemTime(new Date("2026-03-16T07:01:00.000Z"));
    await worker.scheduled(event("* * * * *"), env);
    expect((await getAsset(env.ASSETS, "org1", "med-1"))?.medication?.stock?.quantity).toBe(9);
    expect(await env.DB.prepare(
      "SELECT quantity FROM medication_stock WHERE org_id = ? AND record_id = ?"
    ).bind("org1", "med-1").first("quantity")).toBe(9);
    expect(JSON.parse((await env.BATCH_QUEUE.get("org1:batch:pending")) ?? "[]")).toEqual(["med-1"]);
  });

  it("does not rewrite successfully projected medication stock or its queue on repeated minute crons", async () => {
    await medication("org1", "med-1");
    await worker.scheduled(event("* * * * *"), env);
    const [dose] = await listDoses("org1", env, RANGE);
    await setDoseStatus("org1", env, dose.id, "taken", "web");
    const asset = await env.ASSETS.get("org1:asset:med-1");
    const pending = await env.BATCH_QUEUE.get("org1:batch:pending");
    const assetPut = vi.spyOn(env.ASSETS, "put");
    const queuePut = vi.spyOn(env.BATCH_QUEUE, "put");
    vi.setSystemTime(new Date("2026-03-16T07:01:00.000Z"));
    await worker.scheduled(event("* * * * *"), env);
    vi.setSystemTime(new Date("2026-03-16T07:02:00.000Z"));
    await worker.scheduled(event("* * * * *"), env);
    expect(assetPut).not.toHaveBeenCalled();
    expect(queuePut).not.toHaveBeenCalled();
    expect(await env.ASSETS.get("org1:asset:med-1")).toBe(asset);
    expect(await env.BATCH_QUEUE.get("org1:batch:pending")).toBe(pending);
  });

  it("keeps batch processing on the five-minute cron without materializing doses", async () => {
    await medication("org1", "med-1");
    await env.BATCH_QUEUE.put("org1:batch:pending", JSON.stringify(["med-1"]));
    await env.BATCH_QUEUE.put("org2:batch:pending", JSON.stringify(["other"]));
    await env.BATCH_QUEUE.put("unrelated", "value");
    await worker.scheduled(event("*/5 * * * *"), env);
    expect(processBatch).toHaveBeenCalledTimes(2);
    expect(processBatch).toHaveBeenCalledWith("org1", env, env.DEPLOYER_PRIVATE_KEY);
    expect(processBatch).toHaveBeenCalledWith("org2", env, env.DEPLOYER_PRIVATE_KEY);
    expect(await listDoses("org1", env, RANGE)).toEqual([]);
  });

  it("does not run either workflow for an unrelated cron", async () => {
    await medication("org1", "med-1");
    await worker.scheduled(event("0 * * * *"), env);
    expect(processBatch).not.toHaveBeenCalled();
    expect(await listDoses("org1", env, RANGE)).toEqual([]);
  });
});
