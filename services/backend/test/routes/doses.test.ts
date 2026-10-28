import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index.js";
import { getAsset, type AssetMeta } from "../../src/services/assetStore.js";
import { listDoses, materializeDoses, setDoseStatus } from "../../src/services/doseStore.js";
import type { DoseOccurrence } from "../../src/services/medicationTypes.js";
import { adminReq, makeEnv, req, type TestEnv } from "../helpers/env.js";
import { SQLiteD1 } from "../helpers/d1.js";

const NOW = "2026-03-16T18:00:00.000Z";
const FROM = "2026-03-15T00:00:00.000Z";
const TO = "2026-03-19T00:00:00.000Z";

describe("/api/doses and /api/adherence", () => {
  let env: TestEnv;
  let database: SQLiteD1;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-15T07:00:00.000Z"));
    database = new SQLiteD1();
    env = makeEnv({ DB: database as unknown as TestEnv["DB"] });
    await medication("org1", "med-1", "recipient-1");
    await medication("org1", "med-2", "recipient-2");
    await medication("org2", "foreign", "recipient-1");
    await materializeDoses("org1", env, 72);
    await materializeDoses("org2", env, 72);
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    database.close();
    vi.useRealTimers();
  });

  async function medication(orgId: string, recordId: string, recipientId: string) {
    const asset: AssetMeta = {
      recordId,
      orgId,
      name: recordId === "med-2" ? "Metformin" : "Lisinopril",
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
    };
    await env.ASSETS.put(`${orgId}:asset:${recordId}`, JSON.stringify(asset));
  }

  async function doses(recipientId = "recipient-1"): Promise<DoseOccurrence[]> {
    return listDoses("org1", env, { from: FROM, to: TO, recipientId });
  }

  it("authenticates every dose and adherence read and write", async () => {
    const [dose] = await doses();
    for (const [method, path, body] of [
      ["GET", "/api/doses/org1/due", undefined],
      ["GET", `/api/doses/org1/history?from=${FROM}&to=${TO}`, undefined],
      ["POST", `/api/doses/org1/${dose.id}/status`, { status: "taken" }],
      ["GET", "/api/adherence/org1", undefined],
    ] as const) {
      expect((await worker.fetch(req(method, path, body), env)).status).toBe(401);
      expect((await worker.fetch(req(method, path, body, { "X-Admin-Key": "wrong" }), env)).status)
        .toBe(401);
    }
    expect((await doses())[0].status).toBe("pending");
  });

  it("returns persisted, hydrated due doses from the recent past and upcoming window", async () => {
    const response = await worker.fetch(adminReq("GET", "/api/doses/org1/due?window=12h"), env);
    expect(response.status).toBe(200);
    const result = await response.json() as DoseOccurrence[];
    expect(result).toHaveLength(4);
    expect(result.map((dose) => dose.scheduledAt)).toEqual([
      "2026-03-16T08:00:00.000Z",
      "2026-03-16T08:00:00.000Z",
      "2026-03-16T20:00:00.000Z",
      "2026-03-16T20:00:00.000Z",
    ]);
    expect(result.find((dose) => dose.medicationId === "med-1")).toMatchObject({
      medicationName: "Lisinopril",
      medicationColor: "blue",
      dosage: "10 mg",
      recipientId: "recipient-1",
      status: "pending",
    });
    const repeated = await worker.fetch(adminReq("GET", "/api/doses/org1/due?window=12h"), env);
    expect(await repeated.json()).toEqual(result);
    const defaultWindow = await worker.fetch(adminReq("GET", "/api/doses/org1/due"), env);
    expect(defaultWindow.status).toBe(200);
    expect(await defaultWindow.json()).toEqual(result);
  });

  it("filters history by organization, recipient, and date range", async () => {
    const response = await worker.fetch(adminReq(
      "GET",
      "/api/doses/org1/history?from=2026-03-16T00:00:00.000Z&to=2026-03-17T00:00:00.000Z&recipientId=recipient-2"
    ), env);
    expect(response.status).toBe(200);
    const result = await response.json() as DoseOccurrence[];
    expect(result.map((dose) => [dose.medicationId, dose.recipientId, dose.scheduledAt])).toEqual([
      ["med-2", "recipient-2", "2026-03-16T08:00:00.000Z"],
      ["med-2", "recipient-2", "2026-03-16T20:00:00.000Z"],
    ]);
    const empty = await worker.fetch(adminReq(
      "GET", `/api/doses/org1/history?from=${FROM}&to=${TO}&recipientId=missing`
    ), env);
    expect(await empty.json()).toEqual([]);
    const otherOrg = await worker.fetch(adminReq(
      "GET", `/api/doses/org2/history?from=${FROM}&to=${TO}`
    ), env);
    expect((await otherOrg.json() as DoseOccurrence[]).every((dose) => dose.medicationId === "foreign"))
      .toBe(true);
  });

  it("filters persisted history and due doses by status", async () => {
    const dose = (await doses()).find((item) => item.scheduledAt === "2026-03-16T08:00:00.000Z")!;
    await setDoseStatus("org1", env, dose.id, "taken", "web");
    for (const path of [
      `/api/doses/org1/history?from=${FROM}&to=${TO}&status=taken`,
      "/api/doses/org1/due?window=12h&status=taken",
    ]) {
      const response = await worker.fetch(adminReq("GET", path), env);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([expect.objectContaining({ id: dose.id, status: "taken" })]);
    }
  });

  it("persists status and notes, defaults the source to web, and updates stock once", async () => {
    const [dose] = await doses();
    const path = `/api/doses/org1/${dose.id}/status`;
    const response = await worker.fetch(adminReq("POST", path, {
      status: "taken", notes: "After food",
    }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: dose.id, status: "taken", takenAt: NOW, notes: "After food",
    });
    expect(await env.DB.prepare("SELECT source FROM doses WHERE id = ?").bind(dose.id).first("source"))
      .toBe("web");
    const repeated = await Promise.all([
      worker.fetch(adminReq("POST", path, { status: "taken" }), env),
      worker.fetch(adminReq("POST", path, { status: "taken" }), env),
    ]);
    expect(repeated.map((result) => result.status)).toEqual([200, 200]);
    expect((await getAsset(env.ASSETS, "org1", "med-1"))?.medication?.stock?.quantity).toBe(9);
    expect(JSON.parse((await env.BATCH_QUEUE.get("org1:batch:pending")) ?? "[]")).toEqual(["med-1"]);
    const history = await worker.fetch(adminReq(
      "GET", `/api/doses/org1/history?from=${FROM}&to=${TO}&recipientId=recipient-1`
    ), env);
    expect((await history.json() as DoseOccurrence[]).find((item) => item.id === dose.id))
      .toMatchObject({ status: "taken", notes: "After food", takenAt: NOW });
  });

  it.each(["web", "qr", "mcp", "alexa", "telegram"])("accepts the %s status source", async (source) => {
    const [dose] = await doses();
    const response = await worker.fetch(adminReq(
      "POST", `/api/doses/org1/${dose.id}/status`, { status: "skipped", source }
    ), env);
    expect(response.status).toBe(200);
    expect(await env.DB.prepare("SELECT source FROM doses WHERE id = ?").bind(dose.id).first("source"))
      .toBe(source);
    expect((await getAsset(env.ASSETS, "org1", "med-1"))?.medication?.stock?.quantity).toBe(10);
  });

  it("returns 404 for nonexistent doses and doses belonging to another organization", async () => {
    const [dose] = await doses();
    for (const path of [
      "/api/doses/org1/missing/status",
      `/api/doses/org2/${dose.id}/status`,
    ]) {
      const response = await worker.fetch(adminReq("POST", path, { status: "taken" }), env);
      expect(response.status).toBe(404);
    }
    expect((await doses())[0].status).toBe("pending");
    expect((await getAsset(env.ASSETS, "org1", "med-1"))?.medication?.stock?.quantity).toBe(10);
  });

  it.each([
    {},
    { status: "invalid" },
    { status: 1 },
    { status: "taken", source: "unknown" },
    { status: "taken", source: 1 },
    { status: "taken", notes: 1 },
    null,
    [],
  ])("rejects invalid status payload %j", async (body) => {
    const [dose] = await doses();
    const response = await worker.fetch(adminReq(
      "POST", `/api/doses/org1/${dose.id}/status`, body
    ), env);
    expect(response.status).toBe(400);
    expect((await doses())[0].status).toBe("pending");
  });

  it("rejects malformed JSON", async () => {
    const [dose] = await doses();
    const response = await worker.fetch(new Request(
      `http://localhost/api/doses/org1/${dose.id}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": "test-admin-key" },
        body: "{",
      }
    ), env);
    expect(response.status).toBe(400);
  });

  it.each([
    "/api/doses/org1/due?window=invalid",
    "/api/doses/org1/due?window=-1h",
    "/api/doses/org1/due?window=0h",
    "/api/doses/org1/due?status=invalid",
    "/api/doses/org1/history",
    `/api/doses/org1/history?from=invalid&to=${TO}`,
    `/api/doses/org1/history?from=${FROM}&to=invalid`,
    `/api/doses/org1/history?from=${TO}&to=${FROM}`,
    `/api/doses/org1/history?from=${FROM}&to=${TO}&status=invalid`,
    "/api/adherence/org1?days=invalid",
    "/api/adherence/org1?days=0",
    "/api/adherence/org1?days=-1",
  ])("rejects invalid query input %s", async (path) => {
    expect((await worker.fetch(adminReq("GET", path), env)).status).toBe(400);
  });

  it("returns recipient-scoped adherence and ignores pending, skipped, and rescheduled doses", async () => {
    const first = await doses();
    const second = await doses("recipient-2");
    await setDoseStatus("org1", env, first[0].id, "taken", "web");
    await setDoseStatus("org1", env, first[1].id, "missed", "web");
    await setDoseStatus("org1", env, first[2].id, "skipped", "web");
    await setDoseStatus("org1", env, first[3].id, "rescheduled", "web");
    await setDoseStatus("org1", env, second[0].id, "taken", "web");
    const all = await worker.fetch(adminReq("GET", "/api/adherence/org1?days=30"), env);
    expect(all.status).toBe(200);
    expect(await all.json()).toEqual({ taken: 2, missed: 1, adherence: 2 / 3 });
    const filtered = await worker.fetch(adminReq(
      "GET", "/api/adherence/org1?days=30&recipientId=recipient-1"
    ), env);
    expect(await filtered.json()).toEqual({ taken: 1, missed: 1, adherence: 0.5 });
    for (const path of [
      "/api/adherence/org2?days=30",
      "/api/adherence/org1?days=30&recipientId=missing",
    ]) {
      const response = await worker.fetch(adminReq("GET", path), env);
      expect(await response.json()).toEqual({ taken: 0, missed: 0, adherence: null });
    }
  });

  it("honors the adherence lookback period", async () => {
    const first = await doses();
    await setDoseStatus("org1", env, first[0].id, "missed", "web");
    await setDoseStatus("org1", env, first[1].id, "taken", "web");
    const response = await worker.fetch(adminReq("GET", "/api/adherence/org1?days=1"), env);
    expect(await response.json()).toEqual({ taken: 1, missed: 0, adherence: 1 });
  });
});
