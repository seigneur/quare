import { vi } from "vitest";

let cidCounter = 0;

/**
 * Intercepts fetch calls to https://up.web3.storage and returns a fake CID.
 * All other fetches (chain RPC calls) are forwarded to the real fetch.
 *
 * Call in beforeEach / beforeAll and restore with vi.restoreAllMocks() or
 * fetchMock.restore() in afterEach / afterAll.
 */
export function installFetchMock() {
  const originalFetch = globalThis.fetch;
  cidCounter = 0;

  vi.stubGlobal(
    "fetch",
    async (
      input: string | URL | Request,
      init?: RequestInit
    ): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;

      if (url === "https://up.web3.storage") {
        cidCounter++;
        const cid = `bafytest${String(cidCounter).padStart(4, "0")}`;
        return new Response(JSON.stringify({ cid }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return originalFetch(input, init);
    }
  );

  return {
    restore: () => vi.unstubAllGlobals(),
    lastCid: () => `bafytest${String(cidCounter).padStart(4, "0")}`,
  };
}
