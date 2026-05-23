import { MemoryKV } from "./kv.js";

export interface TestEnv {
  CONTRACT_ADDRESS: string;
  CHAIN_RPC_URL: string;
  ALLOWED_ORIGINS: string;
  ADMIN_KEY: string;
  RECORD_SECRETS: MemoryKV;
  ASSETS: MemoryKV;
  BATCH_QUEUE: MemoryKV;
  W3UP_TOKEN: string;
  DEPLOYER_PRIVATE_KEY: string;
}

export function makeEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    CONTRACT_ADDRESS: process.env.TEST_CONTRACT_ADDRESS ?? "",
    CHAIN_RPC_URL: process.env.TEST_RPC_URL ?? "http://127.0.0.1:8545",
    ALLOWED_ORIGINS: "*",
    ADMIN_KEY: "test-admin-key",
    RECORD_SECRETS: new MemoryKV(),
    ASSETS: new MemoryKV(),
    BATCH_QUEUE: new MemoryKV(),
    W3UP_TOKEN: "test-w3up-token",
    DEPLOYER_PRIVATE_KEY: process.env.TEST_DEPLOYER_KEY ?? "",
    ...overrides,
  };
}

/** Build a Request for calling route handlers directly */
export function req(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function adminReq(
  method: string,
  path: string,
  body?: unknown
): Request {
  return req(method, path, body, { "X-Admin-Key": "test-admin-key" });
}
