import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { ABI } from "./chain.js";
import { listAssets, getPendingBatch, clearPendingBatch, putAsset } from "./assetStore.js";
import { buildTree, leafToBytes32 } from "./merkle.js";
import { uploadAssetSnapshot, uploadTreeSnapshot } from "./ipfsUpload.js";

interface Env {
  CONTRACT_ADDRESS: string;
  CHAIN_RPC_URL: string;
  ASSETS: KVNamespace;
  BATCH_QUEUE: KVNamespace;
  W3UP_TOKEN: string;
}

export async function processBatch(
  orgId: string,
  env: Env,
  walletPrivateKey: string
): Promise<{ root: string; metaCID: string; assetCount: number; processed: string[] } | null> {
  const pending = await getPendingBatch(env.BATCH_QUEUE, orgId);
  if (pending.length === 0) return null;

  const assets = await listAssets(env.ASSETS, orgId);

  // Ensure every asset has an IPFS CID; re-upload dirty assets with fresh content
  const pendingSet = new Set(pending);
  for (const asset of assets) {
    if (!asset.ipfsCID || pendingSet.has(asset.recordId)) {
      const cid = await uploadAssetSnapshot(asset, env.W3UP_TOKEN);
      asset.ipfsCID = cid;
      await putAsset(env.ASSETS, env.BATCH_QUEUE, asset);
    }
  }

  // Rebuild pending list after potential new uploads (putAsset re-adds the record)
  // We already have the full asset list; re-fetch pending is not needed.

  const leaves = assets
    .filter((a): a is typeof a & { ipfsCID: string } => !!a.ipfsCID)
    .map((a) => ({ recordId: a.recordId, ipfsCID: a.ipfsCID }));

  const { root, proofs } = await buildTree(leaves);

  // Store each proof in ASSETS KV
  await Promise.all(
    Object.entries(proofs).map(([recordId, proof]) =>
      env.ASSETS.put(`${orgId}:proof:${recordId}`, JSON.stringify(proof))
    )
  );

  const metaCID = await uploadTreeSnapshot(
    { orgId, root, leaves, proofs, timestamp: new Date().toISOString() },
    env.W3UP_TOKEN
  );

  const account = privateKeyToAccount(walletPrivateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(env.CHAIN_RPC_URL),
  });

  await walletClient.writeContract({
    address: env.CONTRACT_ADDRESS as `0x${string}`,
    abi: ABI,
    functionName: "updateRoot",
    args: [orgId, leafToBytes32(root), metaCID, BigInt(assets.length)],
  });

  await clearPendingBatch(env.BATCH_QUEUE, orgId);

  return { root, metaCID, assetCount: assets.length, processed: pending };
}
