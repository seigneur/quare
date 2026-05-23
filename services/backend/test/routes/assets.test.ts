import { describe, it, expect, beforeEach } from "vitest";
import { handleAssets } from "../../src/routes/assets.js";
import { makeEnv, req, adminReq } from "../helpers/env.js";
import type { TestEnv } from "../helpers/env.js";

describe("/assets routes", () => {
  let env: TestEnv;

  beforeEach(() => {
    env = makeEnv();
  });

  // ── POST /assets/:orgId ──────────────────────────────────────────────────

  it("creates an asset and returns it with a recordId", async () => {
    const body = {
      name: "Laptop A",
      status: "Deployed",
      location: "Floor 2",
      assignee: "alice",
      category: "Computing",
      fields: { serial: "SN001" },
      files: [],
    };

    const res = await handleAssets(req("POST", "/assets/org1", body), env as any, "/assets/org1");
    expect(res.status).toBe(201);

    const data = await res.json() as any;
    expect(data.recordId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(data.orgId).toBe("org1");
    expect(data.name).toBe("Laptop A");
    expect(data.createdAt).toBeTruthy();
    expect(data.updatedAt).toBeTruthy();
  });

  it("marks batch dirty after create", async () => {
    const body = {
      name: "Scanner", status: "Spare", location: "Storage", assignee: "",
      category: "Scanning", fields: {}, files: [],
    };
    const res = await handleAssets(req("POST", "/assets/org1", body), env as any, "/assets/org1");
    const { recordId } = await res.json() as any;

    const pending = await env.BATCH_QUEUE.get("org1:batch:pending");
    expect(JSON.parse(pending!)).toContain(recordId);
  });

  it("returns 400 on invalid JSON", async () => {
    const r = new Request("http://localhost/assets/org1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await handleAssets(r, env as any, "/assets/org1");
    expect(res.status).toBe(400);
  });

  // ── GET /assets/:orgId ───────────────────────────────────────────────────

  it("returns empty array when no assets", async () => {
    const res = await handleAssets(req("GET", "/assets/org1"), env as any, "/assets/org1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("lists all assets for an org", async () => {
    const body = { name: "A", status: "Deployed", location: "L", assignee: "", category: "C", fields: {}, files: [] };
    await handleAssets(req("POST", "/assets/org1", body), env as any, "/assets/org1");
    await handleAssets(req("POST", "/assets/org1", body), env as any, "/assets/org1");

    const res = await handleAssets(req("GET", "/assets/org1"), env as any, "/assets/org1");
    const data = await res.json() as any[];
    expect(data).toHaveLength(2);
  });

  it("does not mix assets between orgs", async () => {
    const body = { name: "A", status: "Spare", location: "L", assignee: "", category: "C", fields: {}, files: [] };
    await handleAssets(req("POST", "/assets/org1", body), env as any, "/assets/org1");
    await handleAssets(req("POST", "/assets/org2", body), env as any, "/assets/org2");

    const res = await handleAssets(req("GET", "/assets/org1"), env as any, "/assets/org1");
    const data = await res.json() as any[];
    expect(data).toHaveLength(1);
    expect(data[0].orgId).toBe("org1");
  });

  // ── GET /assets/:orgId/:recordId ─────────────────────────────────────────

  it("retrieves a specific asset", async () => {
    const body = { name: "Printer X", status: "In use", location: "Lab", assignee: "bob", category: "Printing", fields: {}, files: [] };
    const createRes = await handleAssets(req("POST", "/assets/org1", body), env as any, "/assets/org1");
    const { recordId } = await createRes.json() as any;

    const res = await handleAssets(req("GET", `/assets/org1/${recordId}`), env as any, `/assets/org1/${recordId}`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.recordId).toBe(recordId);
    expect(data.name).toBe("Printer X");
  });

  it("returns 404 for unknown recordId", async () => {
    const res = await handleAssets(
      req("GET", "/assets/org1/non-existent"),
      env as any,
      "/assets/org1/non-existent"
    );
    expect(res.status).toBe(404);
  });

  // ── PATCH /assets/:orgId/:recordId ───────────────────────────────────────

  it("merges fields and updates updatedAt", async () => {
    const body = { name: "Server", status: "Deployed", location: "DC1", assignee: "carol", category: "Compute", fields: {}, files: [] };
    const createRes = await handleAssets(req("POST", "/assets/org1", body), env as any, "/assets/org1");
    const { recordId, createdAt } = await createRes.json() as any;

    // Small delay so updatedAt differs
    await new Promise((r) => setTimeout(r, 5));

    const patchRes = await handleAssets(
      req("PATCH", `/assets/org1/${recordId}`, { location: "DC2", status: "Maintenance" }),
      env as any,
      `/assets/org1/${recordId}`
    );
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json() as any;
    expect(updated.location).toBe("DC2");
    expect(updated.status).toBe("Maintenance");
    expect(updated.name).toBe("Server"); // unchanged
    expect(updated.createdAt).toBe(createdAt); // preserved
    expect(updated.updatedAt).not.toBe(createdAt);
  });

  it("marks batch dirty after PATCH", async () => {
    const body = { name: "X", status: "Spare", location: "L", assignee: "", category: "C", fields: {}, files: [] };
    const { recordId } = await (await handleAssets(req("POST", "/assets/org1", body), env as any, "/assets/org1")).json() as any;

    // Clear queue, then patch
    await env.BATCH_QUEUE.delete("org1:batch:pending");
    await handleAssets(req("PATCH", `/assets/org1/${recordId}`, { location: "new" }), env as any, `/assets/org1/${recordId}`);

    const pending = await env.BATCH_QUEUE.get("org1:batch:pending");
    expect(JSON.parse(pending!)).toContain(recordId);
  });

  it("returns 404 on PATCH for unknown asset", async () => {
    const res = await handleAssets(
      req("PATCH", "/assets/org1/ghost", { name: "x" }),
      env as any,
      "/assets/org1/ghost"
    );
    expect(res.status).toBe(404);
  });

  // ── DELETE /assets/:orgId/:recordId ──────────────────────────────────────

  it("deletes asset from KV (admin only)", async () => {
    const body = { name: "D", status: "Disposed", location: "L", assignee: "", category: "C", fields: {}, files: [] };
    const { recordId } = await (await handleAssets(req("POST", "/assets/org1", body), env as any, "/assets/org1")).json() as any;

    const delRes = await handleAssets(adminReq("DELETE", `/assets/org1/${recordId}`), env as any, `/assets/org1/${recordId}`);
    expect(delRes.status).toBe(200);

    const getRes = await handleAssets(req("GET", `/assets/org1/${recordId}`), env as any, `/assets/org1/${recordId}`);
    expect(getRes.status).toBe(404);
  });

  it("returns 401 on DELETE without admin key", async () => {
    const res = await handleAssets(
      req("DELETE", "/assets/org1/whatever"),
      env as any,
      "/assets/org1/whatever"
    );
    expect(res.status).toBe(401);
  });

  // ── GET /assets/:orgId/:recordId/proof ───────────────────────────────────

  it("returns 404 when no proof exists yet", async () => {
    const body = { name: "P", status: "Spare", location: "L", assignee: "", category: "C", fields: {}, files: [] };
    const { recordId } = await (await handleAssets(req("POST", "/assets/org1", body), env as any, "/assets/org1")).json() as any;

    const res = await handleAssets(
      req("GET", `/assets/org1/${recordId}/proof`),
      env as any,
      `/assets/org1/${recordId}/proof`
    );
    expect(res.status).toBe(404);
  });

  it("returns stored proof after it has been written", async () => {
    const body = { name: "P", status: "Spare", location: "L", assignee: "", category: "C", fields: {}, files: [] };
    const { recordId } = await (await handleAssets(req("POST", "/assets/org1", body), env as any, "/assets/org1")).json() as any;

    // Manually write a proof (normally done by batchProcessor)
    const fakeProof = ["0xaabbcc", "0xddeeff"];
    await env.ASSETS.put(`org1:proof:${recordId}`, JSON.stringify(fakeProof));

    const res = await handleAssets(
      req("GET", `/assets/org1/${recordId}/proof`),
      env as any,
      `/assets/org1/${recordId}/proof`
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.proof).toEqual(fakeProof);
    expect(data.recordId).toBe(recordId);
  });
});
