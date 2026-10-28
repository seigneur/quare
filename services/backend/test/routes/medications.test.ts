import { beforeEach, describe, expect, it } from "vitest";
import { handleAssets } from "../../src/routes/assets.js";
import { handleMedications } from "../../src/routes/medications.js";
import { makeEnv, req, adminReq } from "../helpers/env.js";
import type { TestEnv } from "../helpers/env.js";

const medication = (recipientId = "recipient-1") => ({
  recipientId,
  dosage: "10 mg",
  form: "Tablet",
  color: "blue",
  schedule: { type: "daily", times: ["08:00"] },
  startDate: "2026-01-01",
  timezone: "Asia/Singapore",
  active: true,
});

describe("/api/medications routes", () => {
  let env: TestEnv;
  let assetsEnv: Parameters<typeof handleAssets>[1];
  let medicationsEnv: Parameters<typeof handleMedications>[1];

  beforeEach(() => {
    env = makeEnv();
    assetsEnv = env as unknown as Parameters<typeof handleAssets>[1];
    medicationsEnv = env as unknown as Parameters<typeof handleMedications>[1];
  });

  async function createMedication(recipientId = "recipient-1", name = "Lisinopril") {
    const body = {
      name,
      status: "In use",
      location: "",
      assignee: recipientId,
      category: "Medication",
      fields: {},
      files: [],
      kind: "medication",
      medication: medication(recipientId),
    };
    const response = await handleAssets(
      adminReq("POST", "/assets/org1", body),
      assetsEnv,
      "/assets/org1"
    );
    return { response, asset: await response.json() as { recordId: string } };
  }

  it("indexes medication organizations idempotently on create", async () => {
    await createMedication();
    await createMedication("recipient-2");
    const { results } = await env.DB.prepare("SELECT org_id FROM medication_orgs")
      .all<{ org_id: string }>();
    expect(results).toEqual([{ org_id: "org1" }]);
  });

  it("does not index generic assets and indexes PATCH conversion to medication", async () => {
    const response = await handleAssets(
      req("POST", "/assets/org1", {
        name: "Asset", status: "In use", location: "", assignee: "",
        category: "", fields: {}, files: [],
      }),
      assetsEnv,
      "/assets/org1"
    );
    const { recordId } = await response.json() as { recordId: string };
    expect((await env.DB.prepare("SELECT org_id FROM medication_orgs").all()).results).toEqual([]);
    const path = `/assets/org1/${recordId}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const patch = await handleAssets(
        adminReq("PATCH", path, { kind: "medication", medication: medication() }),
        assetsEnv,
        path
      );
      expect(patch.status).toBe(200);
    }
    expect((await env.DB.prepare("SELECT org_id FROM medication_orgs").all()).results)
      .toEqual([{ org_id: "org1" }]);
  });

  it("does not index rejected medication writes", async () => {
    const response = await handleAssets(
      req("POST", "/assets/org1", { kind: "medication", medication: medication() }),
      assetsEnv,
      "/assets/org1"
    );
    expect(response.status).toBe(401);
    const { response: invalid } = await createMedication("");
    expect(invalid.status).toBe(400);
    expect((await env.DB.prepare("SELECT org_id FROM medication_orgs").all()).results).toEqual([]);
  });

  it("lists medication assets and filters by recipient", async () => {
    const { asset: firstMedication } = await createMedication();
    await createMedication("recipient-2", "Metformin");
    const pending = JSON.parse((await env.BATCH_QUEUE.get("org1:batch:pending")) ?? "[]") as string[];
    expect(pending).toContain(firstMedication.recordId);
    await handleAssets(
      req("POST", "/assets/org1", {
        name: "Laptop",
        status: "Deployed",
        location: "Office",
        assignee: "",
        category: "Computing",
        fields: {},
        files: [],
      }),
      assetsEnv,
      "/assets/org1"
    );

    const all = await handleMedications(
      adminReq("GET", "/api/medications/org1"),
      medicationsEnv,
      "/api/medications/org1"
    );
    expect(await all.json()).toHaveLength(2);

    const filtered = await handleMedications(
      adminReq("GET", "/api/medications/org1?recipientId=recipient-1"),
      medicationsEnv,
      "/api/medications/org1"
    );
    const result = await filtered.json() as Array<{ medication: { recipientId: string } }>;
    expect(result).toHaveLength(1);
    expect(result[0].medication.recipientId).toBe("recipient-1");
  });

  it("returns a specific medication asset and its static insight", async () => {
    const { asset } = await createMedication();
    const path = `/api/medications/org1/${asset.recordId}`;
    const response = await handleMedications(adminReq("GET", path), medicationsEnv, path);
    expect(response.status).toBe(200);
    expect((await response.json() as { recordId: string }).recordId).toBe(asset.recordId);

    const explainPath = `${path}/explain`;
    const explain = await handleMedications(
      adminReq("GET", explainPath),
      medicationsEnv,
      explainPath
    );
    expect(explain.status).toBe(200);
    expect((await explain.json() as { medicationName: string }).medicationName).toBe("Lisinopril");
  });

  it("updates a medication asset through PATCH", async () => {
    const { asset } = await createMedication();
    const path = `/assets/org1/${asset.recordId}`;
    const patch = await handleAssets(
      adminReq("PATCH", path, { medication: { ...medication(), dosage: "20 mg" } }),
      assetsEnv,
      path
    );
    expect(patch.status).toBe(200);

    const medicationPath = `/api/medications/org1/${asset.recordId}`;
    const response = await handleMedications(
      adminReq("GET", medicationPath),
      medicationsEnv,
      medicationPath
    );
    expect((await response.json() as { medication: { dosage: string } }).medication.dosage)
      .toBe("20 mg");
  });

  it("requires admin authentication to read medication assets and insights", async () => {
    const { asset } = await createMedication();
    for (const path of [
      "/api/medications/org1",
      `/api/medications/org1/${asset.recordId}`,
      `/api/medications/org1/${asset.recordId}/explain`,
    ]) {
      const response = await handleMedications(req("GET", path), medicationsEnv, path);
      expect(response.status).toBe(401);
    }
  });

  it("rejects invalid medication data when creating and patching assets", async () => {
    const body = {
      name: "Medication",
      status: "In use",
      location: "",
      assignee: "",
      category: "Medication",
      fields: {},
      files: [],
      kind: "medication",
      medication: { ...medication(), schedule: { type: "daily", times: ["8:00"] } },
    };
    const invalidCreate = await handleAssets(
      adminReq("POST", "/assets/org1", body),
      assetsEnv,
      "/assets/org1"
    );
    expect(invalidCreate.status).toBe(400);
    expect(await invalidCreate.json()).toEqual({
      error: "medication schedule times must use HH:mm format",
    });

    const { asset } = await createMedication();
    const patchPath = `/assets/org1/${asset.recordId}`;
    const invalidPatch = await handleAssets(
      adminReq("PATCH", patchPath, { medication: { ...medication(), dosage: " " } }),
      assetsEnv,
      patchPath
    );
    expect(invalidPatch.status).toBe(400);
    expect(await invalidPatch.json()).toEqual({ error: "medication dosage is required" });
  });

  it("rejects an invalid IANA timezone", async () => {
    const body = {
      name: "Medication",
      status: "In use",
      location: "",
      assignee: "",
      category: "Medication",
      fields: {},
      files: [],
      kind: "medication",
      medication: { ...medication(), timezone: "Not/A_Timezone" },
    };
    const response = await handleAssets(
      adminReq("POST", "/assets/org1", body),
      assetsEnv,
      "/assets/org1"
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "medication timezone must be a valid IANA timezone",
    });
  });

  it.each([
    ["interval schedule without intervalHours", { schedule: { type: "interval", times: ["08:00"] } },
      "medication intervalHours must be a positive number for interval schedules"],
    ["non-positive intervalHours", { schedule: { type: "interval", times: ["08:00"], intervalHours: 0 } },
      "medication intervalHours must be a positive number for interval schedules"],
    ["invalid schedule days", { schedule: { type: "daily", times: ["08:00"], days: [0, 7] } },
      "medication schedule days must be integers from 0 to 6"],
    ["fractional schedule days", { schedule: { type: "daily", times: ["08:00"], days: [1.5] } },
      "medication schedule days must be integers from 0 to 6"],
    ["negative stock quantity", { stock: { quantity: -1, unit: "tablets" } },
      "medication stock quantity must be a number of 0 or more"],
    ["empty stock unit", { stock: { quantity: 0, unit: " " } },
      "medication stock unit must be a non-empty string"],
    ["invalid start date", { startDate: "2026-02-30" },
      "medication startDate must use YYYY-MM-DD format"],
    ["unparseable start date", { startDate: "2026-00-01" },
      "medication startDate must use YYYY-MM-DD format"],
    ["invalid end date", { endDate: "2026-1-01" },
      "medication endDate must use YYYY-MM-DD format"],
    ["invalid color", { color: "chartreuse" },
      "medication color must be a valid medication color"],
  ])("rejects %s", async (_caseName, overrides, error) => {
    const body = {
      name: "Medication",
      status: "In use",
      location: "",
      assignee: "",
      category: "Medication",
      fields: {},
      files: [],
      kind: "medication",
      medication: { ...medication(), ...overrides },
    };
    const response = await handleAssets(
      adminReq("POST", "/assets/org1", body),
      assetsEnv,
      "/assets/org1"
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
  });
});
