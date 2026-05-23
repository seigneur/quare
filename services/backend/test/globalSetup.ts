import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACT_DIR = join(__dirname, "../../contract");

// Anvil's well-known funded account #0
export const ANVIL_DEPLOYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const ANVIL_PORT = 8545;
const ANVIL_RPC = `http://127.0.0.1:${ANVIL_PORT}`;

let anvilProcess: ChildProcess | null = null;

function waitForAnvil(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("anvil did not start within 10s")),
      10_000
    );
    const done = (err?: Error) => { clearTimeout(timeout); err ? reject(err) : resolve(); };
    anvilProcess!.stdout!.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("Listening on")) done();
    });
    anvilProcess!.stderr!.on("data", (chunk: Buffer) => {
      const msg = chunk.toString();
      if (msg.includes("Listening on")) done();
      if (msg.includes("Address already in use")) done(new Error(`anvil: port ${ANVIL_PORT} already in use`));
    });
    anvilProcess!.on("error", (err) => done(new Error(`anvil failed to start: ${err.message}`)));
    anvilProcess!.on("close", (code) => {
      if (code !== 0) done(new Error(`anvil exited with code ${code}`));
    });
  });
}

async function deployContract(): Promise<string> {
  // Build the contract (requires forge in PATH)
  try {
    const foundryBin = process.env.FOUNDRY_BIN ?? "/home/nanoclaw/.foundry/bin";
    execSync("forge build", {
      cwd: CONTRACT_DIR,
      stdio: "pipe",
      env: { ...process.env, PATH: `${foundryBin}:${process.env.PATH}` },
    });
  } catch {
    throw new Error(
      'forge build failed. Is Foundry installed? Run: curl -L https://foundry.paradigm.xyz | bash && foundryup'
    );
  }

  const artifactPath = join(
    CONTRACT_DIR,
    "out/FileRegistry.sol/FileRegistry.json"
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8")) as {
    bytecode: { object: string };
  };
  const bytecode = artifact.bytecode.object as `0x${string}`;

  const account = privateKeyToAccount(ANVIL_DEPLOYER_KEY);
  // Use base chain with chainId 8453 — anvil is started with --chain-id 8453
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(ANVIL_RPC),
  });
  const publicClient = createPublicClient({
    chain: base,
    transport: http(ANVIL_RPC),
  });

  const hash = await walletClient.deployContract({ abi: [], bytecode });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) throw new Error("Contract deployment failed");
  return receipt.contractAddress;
}

export async function setup() {
  // Spawn anvil with Base's chain ID so viem's `base` chain validates
  const foundryBin = process.env.FOUNDRY_BIN ?? "/home/nanoclaw/.foundry/bin";
  const spawnEnv = { ...process.env, PATH: `${foundryBin}:${process.env.PATH}` };
  anvilProcess = spawn(
    `${foundryBin}/anvil`,
    ["--port", String(ANVIL_PORT), "--chain-id", "8453"],
    { stdio: ["pipe", "pipe", "pipe"], env: spawnEnv }
  );

  try {
    await waitForAnvil();
  } catch (err) {
    throw new Error(
      `anvil did not start. Is Foundry installed? ${(err as Error).message}`
    );
  }

  const contractAddress = await deployContract();

  // Expose to all test files via process.env
  process.env.TEST_CONTRACT_ADDRESS = contractAddress;
  process.env.TEST_RPC_URL = ANVIL_RPC;
  process.env.TEST_DEPLOYER_KEY = ANVIL_DEPLOYER_KEY;

  console.log(`\n  anvil running on ${ANVIL_RPC}`);
  console.log(`  FileRegistry deployed at ${contractAddress}\n`);

  return async () => {
    anvilProcess?.kill();
  };
}
