import { createWalletClient, createPublicClient, http } from "viem";
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
  console.log("Deploying FileRegistry (Merkle) from:", account.address);

  const hash = await walletClient.deployContract({
    abi: [],
    bytecode,
  });

  console.log("Tx hash:", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Contract deployed at:", receipt.contractAddress);
  console.log("");
  console.log("Note: constructor calls orgs[msg.sender] = true, so the deployer");
  console.log("address is already approved to call updateRoot.");
  console.log("");
  console.log("Post-deploy steps:");
  console.log("  1. Update CONTRACT_ADDRESS in wrangler.toml");
  console.log("  2. wrangler secret put DEPLOYER_PRIVATE_KEY");
  console.log("  3. wrangler secret put ADMIN_KEY");
  console.log("  4. wrangler secret put W3UP_TOKEN");
  console.log("  5. wrangler kv:namespace create ASSETS");
  console.log("     → copy the id into wrangler.toml [kv_namespaces] binding ASSETS");
  console.log("  6. wrangler kv:namespace create BATCH_QUEUE");
  console.log("     → copy the id into wrangler.toml [kv_namespaces] binding BATCH_QUEUE");
  console.log("  7. wrangler deploy");
}

main().catch(console.error);
