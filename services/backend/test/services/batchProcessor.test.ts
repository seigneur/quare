import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processBatch } from "../../src/services/batchProcessor.js";
import { getPendingBatch, putAsset } from "../../src/services/assetStore.js";
import { makeEnv, type TestEnv } from "../helpers/env.js";
import { SQLiteD1 } from "../helpers/d1.js";
import { installFetchMock } from "../helpers/fetchMock.js";

const { writeContract, waitForTransactionReceipt } = vi.hoisted(() => ({
  writeContract: vi.fn<() => Promise<`0x${string}`>>(),
  waitForTransactionReceipt: vi.fn<(args: { hash: `0x${string}` }) => Promise<{
    status: "success" | "reverted";
  }>>(),
}));

vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(),
  createWalletClient: () => ({ writeContract }),
  createPublicClient: () => ({ waitForTransactionReceipt }),
}));

describe("processBatch transaction confirmation", () => {
  let env: TestEnv;
  let db: SQLiteD1;
  let fetchMock: ReturnType<typeof installFetchMock>;
  const hash = `0x${"12".repeat(32)}` as const;

  beforeEach(async () => {
    vi.resetAllMocks();
    writeContract.mockResolvedValue(hash);
    db = new SQLiteD1();
    env = makeEnv({ DB: db as unknown as TestEnv["DB"] });
    fetchMock = installFetchMock();
    await putAsset(env.ASSETS, env.BATCH_QUEUE, {
      recordId: "asset-1", orgId: "org1", name: "Asset",
      status: "Spare", location: "", assignee: "", category: "",
      fields: {}, files: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    fetchMock.restore();
    db.close();
  });

  it("keeps the queue pending until the submitted transaction is mined successfully", async () => {
    let confirm!: (receipt: { status: "success" }) => void;
    waitForTransactionReceipt.mockReturnValue(new Promise((resolve) => { confirm = resolve; }));
    let completed = false;
    const batch = processBatch("org1", env, env.DEPLOYER_PRIVATE_KEY).then((result) => {
      completed = true;
      return result;
    });

    try {
      await vi.waitFor(() => expect(writeContract).toHaveBeenCalledOnce());
      expect(completed).toBe(false);
      expect(await getPendingBatch(env.BATCH_QUEUE, "org1")).toEqual(["asset-1"]);
      expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash });
    } finally {
      confirm({ status: "success" });
      await batch;
    }

    expect(await getPendingBatch(env.BATCH_QUEUE, "org1")).toEqual([]);
    expect(completed).toBe(true);
  });

  it("rejects reverted transactions and leaves the queue available for retry", async () => {
    waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });

    await expect(processBatch("org1", env, env.DEPLOYER_PRIVATE_KEY))
      .rejects.toThrow("Batch root transaction reverted");
    expect(await getPendingBatch(env.BATCH_QUEUE, "org1")).toEqual(["asset-1"]);
  });

  it("propagates receipt lookup failures without clearing the queue", async () => {
    waitForTransactionReceipt.mockRejectedValue(new Error("Receipt unavailable"));

    await expect(processBatch("org1", env, env.DEPLOYER_PRIVATE_KEY))
      .rejects.toThrow("Receipt unavailable");
    expect(await getPendingBatch(env.BATCH_QUEUE, "org1")).toEqual(["asset-1"]);
  });
});
