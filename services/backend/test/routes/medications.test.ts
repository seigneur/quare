import { beforeEach, describe, expect, it } from "vitest";
import { handleAssets } from "../../src/routes/assets.js";
import { handleMedications } from "../../src/routes/medications.js";
import { makeEnv, req } from "../helpers/env.js";
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
      req("POST", "/assets/org1", body),
      assetsEnv,
      "/assets/org1"
    );
    return { response, asset: await response.json() as { recordId: string } };
  }

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
      req("GET", "/api/medications/org1"),
      medicationsEnv,
      "/api/medications/org1"
    );
    expect(await all.json()).toHaveLength(2);

    const filtered = await handleMedications(
      req("GET", "/api/medications/org1?recipientId=recipient-1"),
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
    const response = await handleMedications(req("GET", path), medicationsEnv, path);
    expect(response.status).toBe(200);
    expect((await response.json() as { recordId: string }).recordId).toBe(asset.recordId);

    const explainPath = `${path}/explain`;
    const explain = await handleMedications(
      req("GET", explainPath),
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
      req("PATCH", path, { medication: { ...medication(), dosage: "20 mg" } }),
      assetsEnv,
      path
    );
    expect(patch.status).toBe(200);

    const medicationPath = `/api/medications/org1/${asset.recordId}`;
    const response = await handleMedications(
      req("GET", medicationPath),
      medicationsEnv,
      medicationPath
    );
    expect((await response.json() as { medication: { dosage: string } }).medication.dosage)
      .toBe("20 mg");
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
      req("POST", "/assets/org1", body),
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
      req("PATCH", patchPath, { medication: { ...medication(), dosage: " " } }),
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
      req("POST", "/assets/org1", body),
      assetsEnv,
      "/assets/org1"
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "medication timezone must be a valid IANA timezone",
    });
  });
});
