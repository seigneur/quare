import type { AssetMeta } from "./assetStore.js";

const UPLOAD_URL = "https://up.web3.storage";

async function uploadJson(data: object, w3upToken: string): Promise<string> {
  const body = JSON.stringify(data);
  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${w3upToken}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`IPFS upload failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { cid?: string };
  if (!json.cid) {
    throw new Error("IPFS upload response missing cid");
  }
  return json.cid;
}

export async function uploadAssetSnapshot(
  asset: AssetMeta,
  w3upToken: string
): Promise<string> {
  return uploadJson(asset, w3upToken);
}

export async function uploadTreeSnapshot(
  treeData: object,
  w3upToken: string
): Promise<string> {
  return uploadJson(treeData, w3upToken);
}
