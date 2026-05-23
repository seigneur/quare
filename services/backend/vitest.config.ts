import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/globalSetup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: "node",
    globals: true,
    pool: "forks",
    // Silence viem's ox library type warnings
    typecheck: { enabled: false },
  },
  resolve: {
    // Resolve .js imports in Worker source to their .ts counterparts
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
});
