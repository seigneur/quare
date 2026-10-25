import { beforeEach, describe, expect, it } from "vitest";
import { handleRecipients } from "../../src/routes/recipients.js";
import { makeEnv, req, adminReq } from "../helpers/env.js";
import type { TestEnv } from "../helpers/env.js";
import type { CareRecipient } from "../../src/services/medicationTypes.js";

describe("/api/recipients routes", () => {
  let env: TestEnv;
  let routeEnv: Parameters<typeof handleRecipients>[1];

  beforeEach(() => {
    env = makeEnv();
    routeEnv = env as unknown as Parameters<typeof handleRecipients>[1];
  });

  it("creates, lists, retrieves, and patches recipients", async () => {
    const created = await handleRecipients(
      adminReq("POST", "/api/recipients/org1", {
        id: "recipient-1",
        name: "Margaret Chen",
        notes: "Morning medication",
      }),
      routeEnv,
      "/api/recipients/org1"
    );
    expect(created.status).toBe(201);

    const list = await handleRecipients(
      req("GET", "/api/recipients/org1"),
      routeEnv,
      "/api/recipients/org1"
    );
    expect(await list.json()).toEqual([{
      id: "recipient-1",
      name: "Margaret Chen",
      notes: "Morning medication",
    }]);

    const recordPath = "/api/recipients/org1/recipient-1";
    const get = await handleRecipients(req("GET", recordPath), routeEnv, recordPath);
    expect((await get.json() as CareRecipient).name).toBe("Margaret Chen");

    const patch = await handleRecipients(
      adminReq("PATCH", recordPath, { name: "Margaret C." }),
      routeEnv,
      recordPath
    );
    expect((await patch.json() as CareRecipient).name).toBe("Margaret C.");
  });

  it("requires admin authentication for writes", async () => {
    const response = await handleRecipients(
      req("POST", "/api/recipients/org1", { name: "No access" }),
      routeEnv,
      "/api/recipients/org1"
    );
    expect(response.status).toBe(401);

    const patch = await handleRecipients(
      req("PATCH", "/api/recipients/org1/recipient-1", { name: "No access" }),
      routeEnv,
      "/api/recipients/org1/recipient-1"
    );
    expect(patch.status).toBe(401);
  });

  it("validates recipient names and scopes records by org", async () => {
    const invalid = await handleRecipients(
      adminReq("POST", "/api/recipients/org1", { name: " " }),
      routeEnv,
      "/api/recipients/org1"
    );
    expect(invalid.status).toBe(400);

    await handleRecipients(
      adminReq("POST", "/api/recipients/org1", { id: "recipient-1", name: "Margaret" }),
      routeEnv,
      "/api/recipients/org1"
    );
    const otherOrg = await handleRecipients(
      req("GET", "/api/recipients/org2/recipient-1"),
      routeEnv,
      "/api/recipients/org2/recipient-1"
    );
    expect(otherOrg.status).toBe(404);
  });
});
