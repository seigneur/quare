import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { handleAssets } from "../../src/routes/assets.js";
import { handleBatch } from "../../src/routes/batch.js";
import { processBatch } from "../../src/services/batchProcessor.js";
import { makeEnv, req, adminReq } from "../helpers/env.js";
import { installFetchMock } from "../helpers/fetchMock.js";
import type { TestEnv } from "../helpers/env.js";

const ABI = [
  {
    name: "currentRoot",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "orgId", type: "string" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "getLatestCheckpoint",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "orgId", type: "string" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "root", type: "bytes32" },
          { name: "metaCID", type: "string" },
          { name: "timestamp", type: "uint256" },
          { name: "assetCount", type: "uint256" },
        ],
      },
    ],
  },
] as const;

describe("/batch routes + processBatch e2e", () => {
  let env: TestEnv;
  let fetchMock: ReturnType<typeof installFetchMock>;
  let publicClient: ReturnType<typeof createPublicClient>;

  beforeAll(() => {
    fetchMock = installFetchMock();
    publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.TEST_RPC_URL ?? "http://127.0.0.1:8545"),
    });
  });

  afterAll(() => {
    fetchMock.restore();
  });

  beforeEach(() => {
    env = makeEnv();
  });

  // ── GET /batch/:orgId/pending ─────────────────────────────────────────────

  it("returns empty pending list when queue is clear", async () => {
    const res = await handleBatch(adminReq("GET", "/batch/org1/pending"), env as any, "/batch/org1/pending");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.pending).toEqual([]);
  });

  it("returns 401 without admin key", async () => {
    const res = await handleBatch(req("GET", "/batch/org1/pending"), env as any, "/batch/org1/pending");
    expect(res.status).toBe(401);
  });

  // ── POST /batch/:orgId/process — no pending ───────────────────────────────

  it("returns no-op message when nothing is pending", async () => {
    const res = await handleBatch(
      adminReq("POST", "/batch/org1/process"),
      env as any,
      "/batch/org1/process"
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.message).toBe("No pending changes");
  });

  // ── processBatch e2e — full flow ──────────────────────────────────────────

  it("processes batch: uploads IPFS, builds Merkle tree, updates on-chain root", async () => {
    const orgId = "e2e-org-" + Date.now();
    const baseBody = {
      status: "Deployed", location: "HQ", assignee: "alice",
      category: "Computing", fields: {}, files: [],
    };

    // Create 3 assets
    for (const name of ["Asset A", "Asset B", "Asset C"]) {
      await handleAssets(
        req("POST", `/assets/${orgId}`, { ...baseBody, name }),
        env as any,
        `/assets/${orgId}`
      );
    }

    // Verify they're all pending
    const pendingRes = await handleBatch(
      adminReq("GET", `/batch/${orgId}/pending`),
      env as any,
      `/batch/${orgId}/pending`
    );
    const { pending } = await pendingRes.json() as any;
    expect(pending).toHaveLength(3);

    // Process batch
    const batchRes = await handleBatch(
      adminReq("POST", `/batch/${orgId}/process`),
      env as any,
      `/batch/${orgId}/process`
    );
    expect(batchRes.status).toBe(200);

    const result = await batchRes.json() as any;
    expect(result.assetCount).toBe(3);
    expect(result.processed).toHaveLength(3);
    expect(result.root).toHaveLength(64); // 32-byte hex
    expect(result.metaCID).toMatch(/^bafytest/);

    // Pending queue should be cleared
    const afterRes = await handleBatch(
      adminReq("GET", `/batch/${orgId}/pending`),
      env as any,
      `/batch/${orgId}/pending`
    );
    const { pending: afterPending } = await afterRes.json() as any;
    expect(afterPending).toHaveLength(0);

    // On-chain root should be set
    const onChainRoot = await publicClient.readContract({
      address: env.CONTRACT_ADDRESS as `0x${string}`,
      abi: ABI,
      functionName: "currentRoot",
      args: [orgId],
    });
    expect(onChainRoot).toBe(`0x${result.root}`);
  });

  it("stores proofs for each asset after batch", async () => {
    const orgId = "proof-org-" + Date.now();
    const body = { name: "X", status: "Spare", location: "L", assignee: "", category: "C", fields: {}, files: [] };

    const createRes = await handleAssets(req("POST", `/assets/${orgId}`, body), env as any, `/assets/${orgId}`);
    const { recordId } = await createRes.json() as any;

    await processBatch(orgId, env as any, env.DEPLOYER_PRIVATE_KEY);

    const proofRes = await handleAssets(
      req("GET", `/assets/${orgId}/${recordId}/proof`),
      env as any,
      `/assets/${orgId}/${recordId}/proof`
    );
    expect(proofRes.status).toBe(200);
    const { proof } = await proofRes.json() as any;
    // Single-asset tree has empty proof
    expect(Array.isArray(proof)).toBe(true);
  });

  it("second batch after a PATCH updates the on-chain root", async () => {
    const orgId = "update-org-" + Date.now();
    const body = { name: "Dev", status: "Deployed", location: "DC", assignee: "bob", category: "Infra", fields: {}, files: [] };

    const { recordId } = await (
      await handleAssets(req("POST", `/assets/${orgId}`, body), env as any, `/assets/${orgId}`)
    ).json() as any;

    // First batch
    await processBatch(orgId, env as any, env.DEPLOYER_PRIVATE_KEY);
    const root1 = await publicClient.readContract({
      address: env.CONTRACT_ADDRESS as `0x${string}`,
      abi: ABI,
      functionName: "currentRoot",
      args: [orgId],
    });

    // Update asset (marks dirty) → second batch
    await handleAssets(
      req("PATCH", `/assets/${orgId}/${recordId}`, { location: "DC2" }),
      env as any,
      `/assets/${orgId}/${recordId}`
    );
    await processBatch(orgId, env as any, env.DEPLOYER_PRIVATE_KEY);
    const root2 = await publicClient.readContract({
      address: env.CONTRACT_ADDRESS as `0x${string}`,
      abi: ABI,
      functionName: "currentRoot",
      args: [orgId],
    });

    // Root changes because asset's IPFS CID changes after re-upload
    // (same asset, new CID from mock — counter increments)
    expect(root2).not.toBe(root1);
  });

  // ── GET /batch/:orgId/checkpoints ─────────────────────────────────────────

  it("returns on-chain checkpoint history", async () => {
    const orgId = "ckpt-org-" + Date.now();
    const body = { name: "Y", status: "Spare", location: "L", assignee: "", category: "C", fields: {}, files: [] };

    await handleAssets(req("POST", `/assets/${orgId}`, body), env as any, `/assets/${orgId}`);
    await processBatch(orgId, env as any, env.DEPLOYER_PRIVATE_KEY);

    const res = await handleBatch(
      adminReq("GET", `/batch/${orgId}/checkpoints`),
      env as any,
      `/batch/${orgId}/checkpoints`
    );
    expect(res.status).toBe(200);

    const checkpoints = await res.json() as any[];
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].root).toMatch(/^0x/);
    expect(checkpoints[0].assetCount).toBe("1");
    expect(Number(checkpoints[0].timestamp)).toBeGreaterThan(0);
  });
});
