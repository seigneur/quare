import { MemoryKV } from "./kv.js";
import { SQLiteD1 } from "./d1.js";
import type { Env } from "../../src/index.js";

export type TestEnv = Env;

export function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    CONTRACT_ADDRESS: process.env.TEST_CONTRACT_ADDRESS ?? "",
    CHAIN_RPC_URL: process.env.TEST_RPC_URL ?? "http://127.0.0.1:8545",
    ALLOWED_ORIGINS: "*",
    ADMIN_KEY: "test-admin-key",
    RECORD_SECRETS: new MemoryKV() as unknown as Env["RECORD_SECRETS"],
    ASSETS: new MemoryKV() as unknown as Env["ASSETS"],
    BATCH_QUEUE: new MemoryKV() as unknown as Env["BATCH_QUEUE"],
    DB: overrides.DB ?? (new SQLiteD1() as unknown as Env["DB"]),
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
