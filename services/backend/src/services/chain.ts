import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";

export interface ChainRecord {
  cid: string;
  pinHash: string;
  salt: string;
  iv: string;
  orgId: string;
  revoked: boolean;
}

const ABI = [
  {
    name: "get",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "cid", type: "string" },
          { name: "pinHash", type: "string" },
          { name: "salt", type: "string" },
          { name: "iv", type: "string" },
          { name: "orgId", type: "string" },
          { name: "revoked", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "revokeRecord",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [],
  },
] as const;

export function makeChainService(contractAddress: string, rpcUrl: string) {
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  return {
    async getRecord(id: string): Promise<ChainRecord> {
      const result = await client.readContract({
        address: contractAddress as Address,
        abi: ABI,
        functionName: "get",
        args: [id as `0x${string}`],
      });
      return result as ChainRecord;
    },
  };
}
