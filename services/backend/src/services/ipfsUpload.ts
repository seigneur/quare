import type { AssetMeta } from "./assetStore.js";

const UPLOAD_URL = "https://up.web3.storage";
const MEDICATION_SALT_PREFIX = "secrets:med:";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function medicationSnapshot(
  asset: AssetMeta,
  recordSecrets: KVNamespace
): Promise<object> {
  const saltKey = `${MEDICATION_SALT_PREFIX}${asset.orgId}:${asset.recordId}`;
  const existing = await recordSecrets.get(saltKey);
  let salt: string;
  if (existing) {
    salt = (JSON.parse(existing) as { salt: string }).salt;
  } else {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    salt = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    await recordSecrets.put(saltKey, JSON.stringify({ salt }));
  }

  const { ipfsCID: _ipfsCID, ...assetWithoutIpfsCID } = asset;
  const content = new TextEncoder().encode(`${salt}:${stableJson(assetWithoutIpfsCID)}`);
  const digest = await crypto.subtle.digest("SHA-256", content);
  const contentHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return {
    recordId: asset.recordId,
    orgId: asset.orgId,
    kind: "medication",
    updatedAt: asset.updatedAt,
    contentHash,
  };
}

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
  w3upToken: string,
  recordSecrets: KVNamespace
): Promise<string> {
  if (asset.kind === "medication") {
    return uploadJson(await medicationSnapshot(asset, recordSecrets), w3upToken);
  }
  return uploadJson(asset, w3upToken);
}

export async function uploadTreeSnapshot(
  treeData: object,
  w3upToken: string
): Promise<string> {
  return uploadJson(treeData, w3upToken);
}
