function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

export async function hashLeaf(recordId: string, ipfsCID: string): Promise<string> {
  const enc = new TextEncoder();
  return sha256(enc.encode(`${recordId}:${ipfsCID}`));
}

export async function hashPair(a: string, b: string): Promise<string> {
  const [first, second] = a <= b ? [a, b] : [b, a];
  const combined = new Uint8Array(64);
  combined.set(hexToBytes(first), 0);
  combined.set(hexToBytes(second), 32);
  return sha256(combined);
}

export async function buildTree(
  leaves: Array<{ recordId: string; ipfsCID: string }>
): Promise<{ root: string; proofs: Record<string, string[]> }> {
  if (leaves.length === 0) {
    return { root: "0".repeat(64), proofs: {} };
  }

  const leafHashes = await Promise.all(
    leaves.map((l) => hashLeaf(l.recordId, l.ipfsCID))
  );

  // Collect padded levels so proofs can be reconstructed
  const levels: string[][] = [];
  let cur = leafHashes;

  while (cur.length > 1) {
    const padded = cur.length % 2 ? [...cur, cur[cur.length - 1]] : [...cur];
    levels.push(padded);
    const next: string[] = [];
    for (let i = 0; i < padded.length; i += 2) {
      next.push(await hashPair(padded[i], padded[i + 1]));
    }
    cur = next;
  }

  const root = cur[0];

  const proofs: Record<string, string[]> = {};
  for (let i = 0; i < leaves.length; i++) {
    const proof: string[] = [];
    let idx = i;
    for (let lvl = 0; lvl < levels.length; lvl++) {
      const sib = idx % 2 === 0 ? idx + 1 : idx - 1;
      proof.push(levels[lvl][sib]);
      idx = Math.floor(idx / 2);
    }
    proofs[leaves[i].recordId] = proof;
  }

  return { root, proofs };
}

export function leafToBytes32(hexLeaf: string): `0x${string}` {
  const hex = hexLeaf.startsWith("0x") ? hexLeaf.slice(2) : hexLeaf;
  return `0x${hex.padStart(64, "0")}` as `0x${string}`;
}
