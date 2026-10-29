import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index.js";
import type { Env } from "../../src/index.js";
import { getAsset, getPendingBatch, listAssets } from "../../src/services/assetStore.js";
import { hashToken } from "../../src/services/mcpTokens.js";
import type { DoseOccurrence } from "../../src/services/medicationTypes.js";
import { SQLiteD1 } from "../helpers/d1.js";
import { adminReq, makeEnv, req } from "../helpers/env.js";

interface RpcResponse {
  result?: {
    tools?: Array<{ name: string; inputSchema: { type: string; properties: Record<string, unknown> } }>;
    isError?: boolean;
    content?: Array<{ type: string; text: string }>;
    structuredContent?: { data: unknown };
    protocolVersion?: string;
  };
  error?: { code: number; message: string };
}

interface Credentials {
  token: string;
  tokenId: string;
}

const NOW = "2026-03-16T07:00:00.000Z";
const TOOL_NAMES = [
  "list_recipients", "add_recipient", "add_medications", "update_medication",
  "deactivate_medication", "set_routine", "list_due", "log_dose", "get_adherence", "refill_status",
];

describe("/mcp", () => {
  let env: Env;
  let db: SQLiteD1;
  let credentials: Credentials;
  let recipientId: string;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    db = new SQLiteD1();
    env = makeEnv({ DB: db as unknown as Env["DB"], APP_URL: "https://quare.example" });
    credentials = await token("orgA");
    const recipient = await call("add_recipient", { name: "Care recipient", notes: "Morning routine" });
    recipientId = data<{ id: string }>(recipient).id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    vi.useRealTimers();
  });

  async function token(orgId: string, scopes = ["read", "write"]): Promise<Credentials> {
    const response = await worker.fetch(adminReq("POST", "/admin/mcp-tokens", { orgId, scopes }), env);
    expect(response.status).toBe(201);
    return response.json();
  }

  async function rpc(method: string, params = {}, bearer = credentials.token): Promise<RpcResponse> {
    const response = await worker.fetch(req("POST", "/mcp", {
      jsonrpc: "2.0", id: 1, method, params,
    }, {
      Authorization: ["Bearer", bearer].join(" "),
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
    }), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.has("Mcp-Session-Id")).toBe(false);
    return response.json();
  }

  function call(name: string, args = {}, bearer = credentials.token) {
    return rpc("tools/call", { name, arguments: args }, bearer);
  }

  function data<T>(response: RpcResponse): T {
    expect(response.error).toBeUndefined();
    expect(response.result?.isError).not.toBe(true);
    expect(response.result?.content?.every((entry) => entry.type === "text")).toBe(true);
    const value = response.result?.structuredContent?.data;
    expect(JSON.parse(response.result!.content![1].text)).toEqual(value);
    return value as T;
  }

  function medication(name = "Medication", extra = {}) {
    return {
      name, dosage: "10 mg", form: "tablet", instructions: "With water",
      schedule: { type: "daily", times: ["08:00", "20:00"] },
      timezone: "UTC", recipientId, stock: { quantity: 5, unit: "tablets", refillThreshold: 4 },
      ...extra,
    };
  }

  async function add(name = "Medication", extra = {}, bearer = credentials.token) {
    const response = await call("add_medications", { medications: [medication(name, extra)] }, bearer);
    return data<Array<{ recordId: string; scanUrl: string }>>(response)[0];
  }

  it("initializes statelessly and lists every tool with JSON schemas", async () => {
    const initialized = await rpc("initialize", {
      protocolVersion: "2025-03-26", capabilities: {},
      clientInfo: { name: "test-client", version: "1.0" },
    });
    expect(initialized.result?.protocolVersion).toBe("2025-03-26");
    const response = await rpc("tools/list");
    expect(response.result?.tools?.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const tool of response.result!.tools!) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it("creates hashed tokens, never stores raw tokens, and revokes them", async () => {
    expect(credentials.tokenId).toBe(await hashToken(credentials.token));
    expect(await env.RECORD_SECRETS.get(`mcp:token:${credentials.tokenId}`)).toBe(
      JSON.stringify({ orgId: "orgA", scopes: ["read", "write"] })
    );
    expect(await env.RECORD_SECRETS.get(`mcp:token:${credentials.token}`)).toBeNull();
    const response = await worker.fetch(adminReq("DELETE", "/admin/mcp-tokens", {
      tokenId: credentials.tokenId,
    }), env);
    expect(response.status).toBe(200);
    expect((await worker.fetch(req("POST", "/mcp", {}, {
      Authorization: ["Bearer", credentials.token].join(" "),
    }), env)).status).toBe(401);
  });

  it("requires admin auth and validates token creation/revocation", async () => {
    for (const method of ["POST", "DELETE"]) {
      expect((await worker.fetch(req(method, "/admin/mcp-tokens", {}), env)).status).toBe(401);
    }
    for (const body of [
      { orgId: "orgA", scopes: ["admin"] }, { orgId: "orgA", scopes: [] },
      { orgId: "../orgB", scopes: ["read"] }, { scopes: ["read"] }, null,
    ]) {
      expect((await worker.fetch(adminReq("POST", "/admin/mcp-tokens", body), env)).status).toBe(400);
    }
    expect((await worker.fetch(adminReq("DELETE", "/admin/mcp-tokens", {
      tokenId: "invalid",
    }), env)).status).toBe(400);
    expect((await worker.fetch(new Request("http://localhost/admin/mcp-tokens", {
      method: "POST", headers: { "X-Admin-Key": env.ADMIN_KEY }, body: "{",
    }), env)).status).toBe(400);
  });

  it("rejects missing, invalid, and non-bearer authentication", async () => {
    for (const authorization of ["", ["Bearer", "invalid"].join(" "), `Basic ${credentials.token}`,
      ["Bearer", credentials.token, "extra"].join(" ")]) {
      const response = await worker.fetch(req("POST", "/mcp", {}, { Authorization: authorization }), env);
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    }
  });

  it("enforces read/write scopes for every tool", async () => {
    const readOnly = await token("orgA", ["read"]);
    const writeOnly = await token("orgA", ["write"]);
    const { recordId } = await add();
    const writeCalls: Array<[string, object]> = [
      ["add_recipient", { name: "New recipient" }],
      ["add_medications", { medications: [medication()] }],
      ["update_medication", { recordId, changes: { name: "Changed" } }],
      ["deactivate_medication", { recordId }],
      ["set_routine", { recordId, schedule: { type: "daily", times: ["09:00"] } }],
      ["log_dose", { doseId: "missing", status: "taken" }],
    ];
    for (const [name, args] of writeCalls) {
      expect((await call(name, args, readOnly.token)).result?.isError).toBe(true);
    }
    for (const name of ["list_recipients", "list_due", "get_adherence", "refill_status"]) {
      expect((await call(name, {}, writeOnly.token)).result?.isError).toBe(true);
    }
    expect(data<unknown[]>(await call("list_recipients", {}, readOnly.token))).toHaveLength(1);
    expect(data<{ id: string }>(await call("add_recipient", { name: "Allowed" }, writeOnly.token)).id).toBeTruthy();
  });

  it("lists and adds recipients without accepting an org override", async () => {
    const response = await call("list_recipients");
    expect(data<Array<{ id: string; name: string }>>(response)).toEqual([
      expect.objectContaining({ id: recipientId, name: "Care recipient" }),
    ]);
    expect((await call("add_recipient", { name: "Foreign", orgId: "orgB" })).result?.isError).toBe(true);
    expect(await env.ASSETS.list({ prefix: "orgB:recipient:" })).toMatchObject({ keys: [] });
  });

  it("bulk-adds five medication assets, queues every record, and returns scan URLs", async () => {
    const queueWrites = vi.spyOn(env.BATCH_QUEUE, "put");
    const response = await call("add_medications", {
      medications: Array.from({ length: 5 }, (_, i) => medication(`Medication ${i}`)),
    });
    const created = data<Array<{ recordId: string; scanUrl: string }>>(response);
    expect(created).toHaveLength(5);
    expect(queueWrites).toHaveBeenCalledTimes(1);
    const assets = await listAssets(env.ASSETS, "orgA");
    expect(assets).toHaveLength(5);
    expect(new Set(await getPendingBatch(env.BATCH_QUEUE, "orgA"))).toEqual(new Set(created.map((item) => item.recordId)));
    for (const item of created) {
      expect(item.scanUrl).toBe(`https://quare.example/scan?id=${item.recordId}`);
      expect(await getAsset(env.ASSETS, "orgA", item.recordId)).toMatchObject({
        kind: "medication", orgId: "orgA",
        medication: { active: true, color: "blue", startDate: "2026-03-16" },
      });
    }
    expect(await env.DB.prepare("SELECT org_id FROM medication_orgs WHERE org_id = ?").bind("orgA").first())
      .toEqual({ org_id: "orgA" });
  });

  it("validates the entire bulk input and recipients before writing any medications", async () => {
    for (const extra of [
      { timezone: "Not/AZone" }, { dosage: "" }, { stock: { quantity: -1, unit: "tablets" } },
      { schedule: { type: "weekdays", times: ["08:00"], days: [7] } },
      { schedule: { type: "interval", times: ["25:00"], intervalHours: 0 } },
      { startDate: "2026-02-30" }, { startDate: "2026-03-16", endDate: "2026-03-15" },
      { recipientId: "foreign-recipient" }, { orgId: "orgB" }, { icon: "pill" },
    ]) {
      expect((await call("add_medications", {
        medications: [medication(), medication("Invalid", extra)],
      })).result?.isError).toBe(true);
      expect(await listAssets(env.ASSETS, "orgA")).toHaveLength(0);
    }
  });

  it("keeps successfully persisted assets queued after a partial bulk storage failure", async () => {
    const put = env.ASSETS.put.bind(env.ASSETS);
    let writes = 0;
    vi.spyOn(env.ASSETS, "put").mockImplementation(async (...args) => {
      if (++writes === 2) throw new Error("Storage unavailable");
      return put(...args);
    });
    const response = await call("add_medications", {
      medications: [medication("First"), medication("Second")],
    });
    expect(response.result?.isError).toBe(true);
    const assets = await listAssets(env.ASSETS, "orgA");
    expect(assets).toHaveLength(1);
    expect(await getPendingBatch(env.BATCH_QUEUE, "orgA")).toEqual([assets[0].recordId]);
  });

  it("requires APP_URL before creating medications and defaults startDate in the local timezone", async () => {
    env.APP_URL = "";
    expect((await call("add_medications", { medications: [medication()] })).result?.isError).toBe(true);
    expect(await listAssets(env.ASSETS, "orgA")).toHaveLength(0);
    env.APP_URL = "https://quare.example/";
    const { recordId, scanUrl } = await add("Local", { timezone: "Pacific/Honolulu" });
    expect((await getAsset(env.ASSETS, "orgA", recordId))?.medication?.startDate).toBe("2026-03-15");
    expect(scanUrl).toBe(`https://quare.example/scan?id=${recordId}`);
  });

  it("updates medication fields without losing omitted stock and replaces routines", async () => {
    const { recordId } = await add();
    const changed = await call("update_medication", {
      recordId, changes: { name: "Renamed", dosage: "20 mg", instructions: "After food" },
    });
    expect(data<{ name: string }>(changed).name).toBe("Renamed");
    expect((await getAsset(env.ASSETS, "orgA", recordId))?.medication).toMatchObject({
      dosage: "20 mg", instructions: "After food", stock: { quantity: 5 },
    });
    const routine = { type: "weekdays", times: ["09:30"], days: [1, 3, 5] };
    data(await call("set_routine", { recordId, schedule: routine, timezone: "Europe/Paris" }));
    expect((await getAsset(env.ASSETS, "orgA", recordId))?.medication).toMatchObject({
      schedule: routine, timezone: "Europe/Paris",
    });
    const doses = data<DoseOccurrence[]>(await call("list_due", { windowHours: 36, recipientId }));
    expect(doses.length).toBeGreaterThan(0);
    expect(doses.every((dose) => dose.scheduledAt.slice(11, 16) === "08:30")).toBe(true);
    data(await call("deactivate_medication", { recordId }));
    expect((await getAsset(env.ASSETS, "orgA", recordId))?.medication?.active).toBe(false);
    expect(data<DoseOccurrence[]>(await call("list_due"))).toHaveLength(0);
  });

  it("removes obsolete future pending doses beyond the default materialization horizon", async () => {
    const { recordId } = await add();
    const initial = data<DoseOccurrence[]>(await call("list_due", { windowHours: 168 }));
    const distant = initial.find((dose) => dose.scheduledAt > "2026-03-20");
    expect(distant).toBeDefined();
    data(await call("set_routine", {
      recordId, schedule: { type: "daily", times: ["10:00"] },
    }));
    expect((await call("log_dose", { doseId: distant!.id, status: "taken" })).result?.isError).toBe(true);
    const updated = data<DoseOccurrence[]>(await call("list_due", { windowHours: 168 }));
    expect(updated.every((dose) => dose.scheduledAt.slice(11, 16) === "10:00")).toBe(true);
    data(await call("deactivate_medication", { recordId }));
    expect(data<DoseOccurrence[]>(await call("list_due", { windowHours: 168 }))).toHaveLength(0);
    expect((await call("log_dose", { doseId: updated[updated.length - 1].id, status: "taken" })).result?.isError).toBe(true);
  });

  it("logs doses by ID and nearest name/time, preserves stock rules and queries adherence/refills", async () => {
    const { recordId } = await add("Lisinopril");
    const doses = data<DoseOccurrence[]>(await call("list_due", { windowHours: 24, recipientId }));
    expect(doses).toHaveLength(2);
    expect(doses.every((dose) => dose.status === "pending" && dose.recipientId === recipientId)).toBe(true);
    vi.setSystemTime(new Date("2026-03-16T08:30:00.000Z"));
    data(await call("log_dose", { doseId: doses[0].id, status: "taken", notes: "After breakfast" }));
    data(await call("log_dose", { doseId: doses[0].id, status: "taken" }));
    expect((await getAsset(env.ASSETS, "orgA", recordId))?.medication?.stock?.quantity).toBe(4);
    expect(await env.DB.prepare("SELECT source, notes FROM doses WHERE id = ?").bind(doses[0].id).first())
      .toEqual({ source: "mcp", notes: "After breakfast" });
    const adherence = data(await call("get_adherence", { days: 7, recipientId }));
    expect(adherence).toEqual({ taken: 1, missed: 0, adherence: 1 });
    expect(data<Array<{ recordId: string }>>(await call("refill_status", { recipientId })))
      .toEqual([expect.objectContaining({ recordId })]);
    const logged = data<DoseOccurrence>(await call("log_dose", {
      medicationName: "lisinopril", time: "2026-03-16T20:05:00Z", recipientId, status: "skipped",
    }));
    expect(logged.id).toBe(doses[1].id);
    expect(logged.status).toBe("skipped");
    data(await call("update_medication", {
      recordId, changes: { stock: { quantity: 30, unit: "tablets", refillThreshold: 4 } },
    }));
    expect(data<unknown[]>(await call("refill_status"))).toHaveLength(0);
  });

  it("rejects missing, ambiguous, and equally near dose selectors", async () => {
    await add("Same");
    expect((await call("log_dose", { status: "taken" })).result?.isError).toBe(true);
    expect((await call("log_dose", { doseId: "missing", status: "taken" })).result?.isError).toBe(true);
    expect((await call("log_dose", {
      medicationName: "Same", time: "2026-03-16T14:00:00Z", status: "taken",
    })).result?.isError).toBe(true);
    await add("Same");
    expect((await call("log_dose", {
      medicationName: "Same", time: "2026-03-16T08:00:00Z", status: "taken",
    })).result?.isError).toBe(true);
    expect((await call("log_dose", {
      medicationName: "Missing", time: "2026-03-16T08:00:00Z", status: "taken",
    })).result?.isError).toBe(true);
  });

  it("isolates every read and write from another organization", async () => {
    const foreign = await token("orgB");
    const foreignRecipient = data<{ id: string }>(await call("add_recipient", { name: "Private" }, foreign.token));
    const foreignMed = await add("Private medication", { recipientId: foreignRecipient.id }, foreign.token);
    const foreignDoses = data<DoseOccurrence[]>(await call("list_due", {}, foreign.token));
    for (const [name, args] of [
      ["update_medication", { recordId: foreignMed.recordId, changes: { name: "Stolen" } }],
      ["deactivate_medication", { recordId: foreignMed.recordId }],
      ["set_routine", { recordId: foreignMed.recordId, schedule: { type: "daily", times: ["09:00"] } }],
      ["log_dose", { doseId: foreignDoses[0].id, status: "taken" }],
      ["log_dose", { medicationName: "Private medication", time: foreignDoses[0].scheduledAt, status: "taken" }],
      ["add_medications", { medications: [medication("Foreign", { recipientId: foreignRecipient.id })] }],
    ] as Array<[string, object]>) {
      expect((await call(name, args)).result?.isError).toBe(true);
    }
    expect(data<Array<{ id: string }>>(await call("list_recipients")).map((item) => item.id)).toEqual([recipientId]);
    expect(data<unknown[]>(await call("list_due", { recipientId: foreignRecipient.id }))).toHaveLength(0);
    expect(data<unknown[]>(await call("refill_status"))).toHaveLength(0);
    expect(data(await call("get_adherence", { recipientId: foreignRecipient.id })))
      .toEqual({ taken: 0, missed: 0, adherence: null });
    expect((await getAsset(env.ASSETS, "orgB", foreignMed.recordId))?.name).toBe("Private medication");
    expect(await listAssets(env.ASSETS, "orgA")).toHaveLength(0);
    expect(data<unknown[]>(await call("list_due", {}, foreign.token))).toHaveLength(foreignDoses.length);
  });

  it("validates tool arguments and rejects unknown tools", async () => {
    for (const [name, args] of [
      ["list_due", { windowHours: 169 }], ["list_due", { windowHours: 0 }],
      ["get_adherence", { days: 0 }], ["get_adherence", { days: 1.5 }],
      ["log_dose", { doseId: "missing", status: "invalid" }],
      ["log_dose", { doseId: "missing", status: "taken", source: "web" }],
      ["set_routine", { recordId: "missing", schedule: { type: "daily", times: [] } }],
    ] as Array<[string, object]>) {
      expect((await call(name, args)).result?.isError).toBe(true);
    }
    expect((await call("unknown_tool")).result?.isError).toBe(true);
  });

  it("supports MCP preflight, rejects other methods and untrusted origins, and handles malformed JSON", async () => {
    const preflight = await worker.fetch(req("OPTIONS", "/mcp"), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect((await worker.fetch(req("GET", "/mcp", undefined, {
      Authorization: ["Bearer", credentials.token].join(" "),
    }), env)).status).toBe(405);
    env.ALLOWED_ORIGINS = "https://quare.example";
    expect((await worker.fetch(req("POST", "/mcp", {}, {
      Authorization: ["Bearer", credentials.token].join(" "), Origin: "https://untrusted.example",
    }), env)).status).toBe(403);
    const malformed = await worker.fetch(new Request("http://localhost/mcp", {
      method: "POST", body: "{",
      headers: {
        Authorization: ["Bearer", credentials.token].join(" "),
        Accept: "application/json, text/event-stream", "Content-Type": "application/json",
      },
    }), env);
    expect(malformed.status).toBe(400);
    expect((await malformed.json() as RpcResponse).error?.code).toBe(-32700);
  });
});
