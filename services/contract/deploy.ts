import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { readFileSync } from "fs";

// Usage: PRIVATE_KEY=0x... RPC_URL=https://... npx ts-node deploy.ts

const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
const rpcUrl = process.env.RPC_URL ?? "https://mainnet.base.org";

if (!privateKey) {
  console.error("PRIVATE_KEY env var required");
  process.exit(1);
}

const account = privateKeyToAccount(privateKey);

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(rpcUrl),
});

const publicClient = createPublicClient({
  chain: base,
  transport: http(rpcUrl),
});

// Load compiled bytecode — run `solc --bin FileRegistry.sol` first
const bytecode = readFileSync("./FileRegistry.bin", "utf-8").trim() as `0x${string}`;

async function main() {
  console.log("Deploying FileRegistry from:", account.address);

  const hash = await walletClient.deployContract({
    abi: [],
    bytecode,
  });

  console.log("Tx hash:", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Contract deployed at:", receipt.contractAddress);
}

main().catch(console.error);
