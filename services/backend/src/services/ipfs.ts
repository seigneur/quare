const IPFS_GATEWAY = "https://w3s.link/ipfs";

export async function fetchIpfsMetadata(cid: string): Promise<unknown> {
  const res = await fetch(`${IPFS_GATEWAY}/${cid}`);
  if (!res.ok) {
    throw new Error(`IPFS fetch failed: ${res.status}`);
  }
  return res.json();
}
