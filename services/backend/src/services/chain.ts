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

export interface Checkpoint {
  root: `0x${string}`;
  metaCID: string;
  timestamp: bigint;
  assetCount: bigint;
}

export const ABI = [
  // New Merkle architecture
  {
    name: "updateRoot",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orgId", type: "string" },
      { name: "newRoot", type: "bytes32" },
      { name: "metaCID", type: "string" },
      { name: "assetCount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "verify",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "orgId", type: "string" },
      { name: "leaf", type: "bytes32" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getCheckpointCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "orgId", type: "string" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getCheckpoint",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "orgId", type: "string" },
      { name: "index", type: "uint256" },
    ],
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
  {
    name: "currentRoot",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "orgId", type: "string" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "approveOrg",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "org", type: "address" }],
    outputs: [],
  },
  {
    name: "revokeOrg",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "org", type: "address" }],
    outputs: [],
  },
  // Legacy — kept for backward compat with /pin/verify and /admin routes
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

  const address = contractAddress as Address;

  return {
    async getRecord(id: string): Promise<ChainRecord> {
      const result = await client.readContract({
        address,
        abi: ABI,
        functionName: "get",
        args: [id as `0x${string}`],
      });
      return result as ChainRecord;
    },

    async getCurrentRoot(orgId: string): Promise<`0x${string}`> {
      return client.readContract({
        address,
        abi: ABI,
        functionName: "currentRoot",
        args: [orgId],
      }) as Promise<`0x${string}`>;
    },

    async getCheckpointCount(orgId: string): Promise<bigint> {
      return client.readContract({
        address,
        abi: ABI,
        functionName: "getCheckpointCount",
        args: [orgId],
      }) as Promise<bigint>;
    },

    async getCheckpoint(orgId: string, index: bigint): Promise<Checkpoint> {
      const result = await client.readContract({
        address,
        abi: ABI,
        functionName: "getCheckpoint",
        args: [orgId, index],
      });
      return result as Checkpoint;
    },

    async getLatestCheckpoint(orgId: string): Promise<Checkpoint> {
      const result = await client.readContract({
        address,
        abi: ABI,
        functionName: "getLatestCheckpoint",
        args: [orgId],
      });
      return result as Checkpoint;
    },

    async verifyProof(orgId: string, leaf: `0x${string}`, proof: `0x${string}`[]): Promise<boolean> {
      return client.readContract({
        address,
        abi: ABI,
        functionName: "verify",
        args: [orgId, leaf, proof],
      }) as Promise<boolean>;
    },
  };
}
