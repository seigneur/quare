# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo layout

```
apps/web/          Next.js 15 frontend (marketing page + super-admin panel)
apps/ios/          Swift/SwiftUI iOS client
apps/android/      Kotlin/Jetpack Compose Android client (stub — no Kotlin sources yet)
services/backend/  Cloudflare Worker (the only backend)
services/contract/ Solidity contract + viem deploy script
```

## Commands

### Web (`apps/web/`)
```bash
npm install
npm run dev       # http://localhost:3000
npm run build
npm run lint
```

### Backend worker (`services/backend/`)
```bash
npm install
npm run dev       # wrangler dev (local Worker sandbox)
npm run deploy    # wrangler deploy
npm run cf-typegen  # regenerate Cloudflare bindings types
node_modules/.bin/tsc --noEmit  # type-check (use local tsc, not npx tsc)
```

### Backend tests (`services/backend/`)
```bash
# Requires Foundry (anvil + forge) — install once with:
# curl -L https://foundry.paradigm.xyz | bash && ~/.foundry/bin/foundryup
PATH="/home/nanoclaw/.foundry/bin:$PATH" node_modules/.bin/vitest run
```

### Contract (`services/contract/`)
```bash
# Forge tests (unit):
PATH="/home/nanoclaw/.foundry/bin:$PATH" forge test -v

# Compile + deploy:
PATH="/home/nanoclaw/.foundry/bin:$PATH" forge build
PRIVATE_KEY=0x... RPC_URL=https://mainnet.base.org npx ts-node deploy.ts
```

## Architecture

### Backend (Cloudflare Worker)

The worker is the single coordinator between three storage layers:

| Layer | Binding | Role |
|-------|---------|------|
| Cloudflare KV `ASSETS` | live DB | mutable asset records, proof cache |
| Cloudflare KV `BATCH_QUEUE` | dirty queue | tracks which assets need Merkle re-commitment |
| Cloudflare KV `RECORD_SECRETS` | secret store | per-record salt+iv for legacy PIN flow |
| IPFS (web3.storage) | immutable snapshots | per-asset `meta.json`, tree snapshot |
| Base L2 (viem) | trust anchor | Merkle root + checkpoint history |

**Request routing** (`src/index.ts`): pathname-prefix dispatch — `/admin/*`, `/assets/*`, `/batch/*`, `/pin/verify`, `/files/:cid`. The `scheduled` handler fires every 5 minutes, lists all keys in `BATCH_QUEUE`, extracts unique orgIds, and calls `processBatch` for each.

**Route handlers:**
- `src/routes/admin.ts` — `POST /admin/records` (store salt+iv), `POST /admin/records/:id/revoke`, `GET /admin/records/:id`
- `src/routes/assets.ts` — `GET/POST /assets/:orgId`, `GET/PATCH/DELETE /assets/:orgId/:recordId`, `GET /assets/:orgId/:recordId/proof`
- `src/routes/batch.ts` — `POST /batch/:orgId/process`, `GET /batch/:orgId/pending`, `GET /batch/:orgId/checkpoints`
- `src/routes/pin.ts` — `POST /pin/verify`
- `src/routes/files.ts` — `GET /files/:cid`

**Asset shape** (`src/services/assetStore.ts` — `AssetMeta`): `recordId`, `orgId`, `name`, `status` (Deployed/In use/Maintenance/Spare/Disposed), `location`, `assignee`, `category`, `fields` (Record), `files` (array with name/cid/encrypted/size), `createdAt`, `updatedAt`, `ipfsCID?`.

**KV key namespacing:**
- `{orgId}:asset:{recordId}` — asset JSON in ASSETS
- `{orgId}:batch:pending` — JSON array of dirty recordIds in BATCH_QUEUE
- `{orgId}:proof:{recordId}` — Merkle sibling proof array in ASSETS
- `secrets:{recordId}` — `{salt, iv}` JSON in RECORD_SECRETS

**Batch flow** (`src/services/batchProcessor.ts`):
1. Reads pending dirty recordIds from BATCH_QUEUE
2. Lists all org assets; re-uploads IPFS snapshot for any asset missing a CID **or** in the dirty set (ensures PATCH changes are reflected)
3. Builds a SHA-256 binary Merkle tree over all org assets (`src/services/merkle.ts`)
4. Stores per-asset sibling proofs back into ASSETS KV
5. Uploads a full tree snapshot to IPFS → `metaCID`
6. Calls `updateRoot(orgId, root, metaCID, assetCount)` on-chain via viem `walletClient`
7. Clears the pending queue

**Merkle tree** (`src/services/merkle.ts`): pure Web Crypto SHA-256, no npm libraries. Leaf = `SHA256("${recordId}:${ipfsCID}")`. Pair hash = `SHA256(sort(a,b) concatenated as bytes)`. Odd-count levels duplicate the last leaf. The on-chain `verify()` in the contract uses keccak256 — the worker-built SHA-256 roots are stored as the bytes32 value but are not verifiable via the Solidity `MerkleProof.verify()` without a matching off-chain verifier.

**Secrets — what goes where:**
- `DEPLOYER_PRIVATE_KEY` — wrangler secret only, never in wrangler.toml
- `ADMIN_KEY`, `W3UP_TOKEN` — wrangler secrets (empty placeholder in wrangler.toml vars is overridden by the secret in prod)
- KV namespace IDs — fill in wrangler.toml after running `wrangler kv:namespace create`

### Contract (`services/contract/FileRegistry.sol`)

Deployed on Base mainnet. Key functions:
- `updateRoot(orgId, newRoot, metaCID, assetCount)` — called by the worker's DEPLOYER account (approved in constructor)
- `currentRoot(orgId)` — mapping accessor, returns current bytes32 root
- `getLatestCheckpoint(orgId)` / `getCheckpoint(orgId, index)` — checkpoint history
- `approveOrg(address)` / `revokeOrg(address)` — owner-only org management

The deployer address is auto-approved as an org in the constructor.

### Web (`apps/web/`)

Two pages:
- `/` — static marketing landing
- `/admin` — super-admin panel (client component): admin key stored in `localStorage`, calls `src/lib/admin-api.ts` which sends `X-Admin-Key` header, renders QR codes via `react-qr-code`, supports print-to-PDF QR sheets via `window.print()` with `@media print` CSS isolation

`NEXT_PUBLIC_API_URL` — points to the deployed Worker URL.
`NEXT_PUBLIC_APP_URL` — used to generate QR scan deep-link URLs (`{APP_URL}/scan?id={recordId}`).

### iOS (`apps/ios/`)

`QuareAPI.swift` — single static enum wrapping URLSession calls to `QUARE_API_URL` (read from env or `Info.plist` key `QuareAPIURL`). Currently implements `storeDocument` and `retrieveDocument` against a `/documents` endpoint (pre-Merkle legacy API shape).

### Admin auth pattern

`verifyAdminKey` (exported from `src/routes/admin.ts`) does a timing-safe string comparison against `env.ADMIN_KEY`. All write-capable and sensitive routes (`DELETE /assets`, all `/batch/*`, all `/admin/*`) require the `X-Admin-Key` request header.

## Testing

### Backend (Vitest + Anvil)

Tests live in `services/backend/test/`. The global setup (`test/globalSetup.ts`) spawns a local Anvil chain (port 8545, chain ID 8453 to match viem's `base`), runs `forge build` to compile the contract, deploys it, and exposes `TEST_CONTRACT_ADDRESS` / `TEST_RPC_URL` / `TEST_DEPLOYER_KEY` to all tests.

- `test/helpers/kv.ts` — `MemoryKV` in-process KV stub
- `test/helpers/env.ts` — `makeEnv()`, `req()`, `adminReq()` request builders
- `test/helpers/fetchMock.ts` — stubs `fetch` for `https://up.web3.storage`, returns incrementing fake CIDs (`bafytest0001`, …); real RPC calls pass through
- `test/routes/admin.test.ts` — auth, store/revoke/inspect record secrets
- `test/routes/assets.test.ts` — CRUD, dirty-queue marking, proof storage
- `test/routes/batch.test.ts` — route tests + full e2e `processBatch` (IPFS → Merkle → on-chain root via live Anvil)

### Contract (Forge)

`services/contract/test/FileRegistry.t.sol` — 25 tests covering ownership, `updateRoot`, checkpoint history, Merkle `verify` (1/2/3-leaf, wrong leaf/org), and all three events. Uses `forge-std` (submodule at `lib/forge-std`).
