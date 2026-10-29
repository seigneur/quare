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

The worker coordinates mutable records, dose history, and immutable verification:

| Layer | Binding | Role |
|-------|---------|------|
| Cloudflare KV `ASSETS` | live DB | mutable asset records, proof cache |
| Cloudflare KV `BATCH_QUEUE` | dirty queue | tracks which assets need Merkle re-commitment |
| Cloudflare KV `RECORD_SECRETS` | secret store | per-record salt+iv for legacy PIN flow |
| Cloudflare D1 `DB` | dose log | scheduled doses, statuses, and adherence |
| IPFS (web3.storage) | immutable snapshots | per-asset `meta.json`, tree snapshot |
| Base L2 (viem) | trust anchor | Merkle root + checkpoint history |

**Request routing** (`src/index.ts`): pathname-prefix dispatch — `/admin/*`, `/assets/*`, `/batch/*`, `/api/*`, `/pin/verify`, `/files/:cid`. The `*/5 * * * *` cron keeps processing `BATCH_QUEUE` through `processBatch`. The `* * * * *` cron reads organizations from the D1 `medication_orgs` index, materializes the next 36 hours of doses, and marks pending doses missed after a 60-minute grace period. Medication creates and PATCHes register their organization idempotently before writing KV; the cron never lists unprefixed `ASSETS` keys. Index entries are retained after medication deletion so dose history and missed marking remain available.

**Route handlers:**
- `src/routes/mcp.ts` — stateless `POST /mcp` using `@modelcontextprotocol/sdk`'s Web Standard Streamable HTTP transport (JSON responses, no Durable Objects). Access tokens are SHA-256-hashed in `RECORD_SECRETS` at `mcp:token:{hash}` and map to `{orgId, scopes}` (`read`/`write`). Admin-authenticated `POST/DELETE /admin/mcp-tokens` create/revoke credentials. Every tool uses the token's fixed organization; no organization argument is accepted.
- `src/routes/admin.ts` — `POST /admin/records` (store salt+iv), `POST /admin/records/:id/revoke`, `GET /admin/records/:id`
- `src/routes/assets.ts` — `GET/POST /assets/:orgId`, `GET/PATCH/DELETE /assets/:orgId/:recordId`, `GET /assets/:orgId/:recordId/proof`
- `src/routes/medications.ts` — `GET /api/medications/:orgId` (optional `recipientId` filter), `GET /api/medications/:orgId/:recordId`, and static `GET .../explain`
- `src/routes/recipients.ts` — `GET/POST /api/recipients/:orgId`, `GET/PATCH /api/recipients/:orgId/:id` (all routes require `X-Admin-Key`)
- `src/routes/doses.ts` — authenticated `GET /api/doses/:orgId/due?window=12h` (past and upcoming window), `GET /api/doses/:orgId/history?from&to&recipientId&status`, `POST /api/doses/:orgId/:doseId/status`, and `GET /api/adherence/:orgId?recipientId&days=30`. Adherence is `taken / (taken + missed)`, or `null` without observations.
- `src/routes/batch.ts` — `POST /batch/:orgId/process`, `GET /batch/:orgId/pending`, `GET /batch/:orgId/checkpoints`
- `src/routes/pin.ts` — `POST /pin/verify`
- `src/routes/files.ts` — `GET /files/:cid`

**Asset shape** (`src/services/assetStore.ts` — `AssetMeta`): `recordId`, `orgId`, `name`, `status` (Deployed/In use/Maintenance/Spare/Disposed), `location`, `assignee`, `category`, `fields` (Record), `files` (array with name/cid/encrypted/size), `kind?` (generic by default or medication), `medication?` (`MedicationDetails`), `createdAt`, `updatedAt`, `ipfsCID?`. Medication assets use the same KV, IPFS, batch queue, and Merkle flow as other assets.

**KV key namespacing:**
- `{orgId}:asset:{recordId}` — asset JSON in ASSETS
- `{orgId}:recipient:{id}` — recipient JSON in ASSETS
- `{orgId}:batch:pending` — JSON array of dirty recordIds in BATCH_QUEUE
- `{orgId}:proof:{recordId}` — Merkle sibling proof array in ASSETS
- `secrets:{recordId}` — `{salt, iv}` JSON in RECORD_SECRETS

**Dose scheduling and storage:** `src/services/schedule.ts` expands medication schedules in their IANA timezone over a half-open UTC range. Daily and weekday schedules retain local wall-clock times; nonexistent DST times are skipped and repeated times occur once at the earlier instant. Intervals use elapsed hours anchored to the start date's first schedule time. Start/end dates are inclusive local dates. `src/services/doseStore.ts` inserts occurrences with `INSERT OR IGNORE` into D1, uniquely keyed by `(record_id, scheduled_at)`. D1 triggers atomically decrement optional stock on transition to `taken` (never below zero) and restore the consumed amount when correcting a taken dose. Repeated confirmations do not decrement again. `medication_stock` owns inventory between explicit stock quantity edits, which reset that counter; metadata edits preserve omitted stock and do not reset inventory. Status requests and the minute cron reconcile pending stock to KV through `putAsset`, clearing `needs_sync` only after both asset and batch-queue writes succeed. This makes partial KV failures retryable and keeps private snapshots and Merkle batches current.

Create a D1 database, fill the `DB` binding's `database_id` in `services/backend/wrangler.toml`, and apply all pending migrations using `wrangler d1 migrations apply quare-doses` (`--local` for development, `--remote` for production). `0002_medication_orgs.sql` seeds the organization index from existing dose and stock records. For pre-existing medication organizations without either kind of D1 record, register each once with `INSERT OR IGNORE INTO medication_orgs (org_id) VALUES ('your-org-id')` via `wrangler d1 execute`, or PATCH an existing medication through the authenticated asset API. D1 retains history even if the medication asset is deleted. Dashboard and history use the authenticated dose APIs rather than mock data.

Materialization also removes obsolete future pending occurrences within its horizon. Medication schedule, recipient, active-state, and disposal edits immediately refresh that horizon; deletion removes future pending doses. Past occurrences and already recorded statuses remain intact.

**MCP tools** (`src/services/mcpTools.ts`): Zod-validated recipient listing/creation, bulk medication creation, update/deactivate, routine replacement, pending-dose queries, dose logging (source `mcp`, by ID or nearest pending name/time), adherence, and refill status. REST and MCP share `assetMutations.saveAsset`/`saveNewAssets` for medication organization registration, stock synchronization, schedule refresh, KV persistence, and Merkle batch queuing, plus `recipientStore` for recipient listing/creation and the existing dose services. Bulk additions merge all successfully persisted IDs into the batch queue with one write. Schedule edits remove all future pending doses for the changed medication before refreshing the default horizon, including doses previously materialized by longer MCP queries. `APP_URL` configures returned `{APP_URL}/scan?id={recordId}` links. See `docs/mcp.md` for scopes, client setup, schemas, and examples.

**Batch flow** (`src/services/batchProcessor.ts`):
1. Reads pending dirty recordIds from BATCH_QUEUE
2. Lists all org assets; re-uploads IPFS snapshot for any asset missing a CID **or** in the dirty set (ensures PATCH changes are reflected). Generic assets upload their full snapshot; medication assets upload only `{recordId, orgId, kind, updatedAt, contentHash}` so health data is not published.
3. Builds a SHA-256 binary Merkle tree over all org assets (`src/services/merkle.ts`)
4. Stores per-asset sibling proofs back into ASSETS KV
5. Uploads a full tree snapshot to IPFS → `metaCID`
6. Calls `updateRoot(orgId, root, metaCID, assetCount)` on-chain via viem `walletClient`
7. Waits for a successful transaction receipt before clearing the pending queue; reverted transactions or receipt lookup failures leave the queue available for retry

**Merkle tree** (`src/services/merkle.ts`): pure Web Crypto SHA-256, no npm libraries. Leaf = `SHA256("${recordId}:${ipfsCID}")`. Pair hash = `SHA256(sort(a,b) concatenated as bytes)`. Odd-count levels duplicate the last leaf. The on-chain `verify()` in the contract uses keccak256 — the worker-built SHA-256 roots are stored as the bytes32 value but are not verifiable via the Solidity `MerkleProof.verify()` without a matching off-chain verifier.

**Secrets — what goes where:**
- `DEPLOYER_PRIVATE_KEY` — wrangler secret only, never in wrangler.toml
- `ADMIN_KEY`, `W3UP_TOKEN` — wrangler secrets (empty placeholder in wrangler.toml vars is overridden by the secret in prod)
- Medication snapshot salts — stored in `RECORD_SECRETS` at `secrets:med:{orgId}:{recordId}` and reused to salt a SHA-256 hash of the stable full medication asset JSON; separate from PIN-flow `secrets:{recordId}` entries.
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
`NEXT_PUBLIC_ORG_ID` — selects the organization for the caregiver medication and recipient pages.
`NEXT_PUBLIC_APP_URL` — used to generate QR scan deep-link URLs (`{APP_URL}/scan?id={recordId}`).

For development data, `scripts/seed-medications.ts` posts the sample recipients and medications to the API. Set `API_URL`, `ORG_ID`, and `ADMIN_KEY` (or their `NEXT_PUBLIC_*` API/org equivalents), then run `node --experimental-strip-types scripts/seed-medications.ts`.

### iOS (`apps/ios/`)

`QuareAPI.swift` — single static enum wrapping URLSession calls to `QUARE_API_URL` (read from env or `Info.plist` key `QuareAPIURL`). Currently implements `storeDocument` and `retrieveDocument` against a `/documents` endpoint (pre-Merkle legacy API shape).

### Admin auth pattern

`verifyAdminKey` (exported from `src/routes/admin.ts`) does a timing-safe string comparison against `env.ADMIN_KEY`. All write-capable and sensitive routes (`DELETE /assets`, all `/batch/*`, all `/admin/*`, and all `/api/medications/*` and `/api/recipients/*`) require the `X-Admin-Key` request header. Medication assets on `/assets/*` require the key for creation, updates, and direct reads; unauthenticated asset lists omit medications, while generic asset behavior remains public.

## Testing

### Backend (Vitest + Anvil)

Tests live in `services/backend/test/`. The global setup (`test/globalSetup.ts`) spawns a local Anvil chain (port 8545, chain ID 8453 to match viem's `base`), runs `forge build` to compile the contract, deploys it, and exposes `TEST_CONTRACT_ADDRESS` / `TEST_RPC_URL` / `TEST_DEPLOYER_KEY` to all tests.

- `test/helpers/kv.ts` — `MemoryKV` in-process KV stub
- `test/helpers/d1.ts` — in-memory SQLite-backed D1 shim that applies the real dose migration
- `test/helpers/env.ts` — `makeEnv()`, `req()`, `adminReq()` request builders
- `test/helpers/fetchMock.ts` — stubs `fetch` for `https://up.web3.storage`, returns incrementing fake CIDs (`bafytest0001`, …); real RPC calls pass through
- `test/routes/admin.test.ts` — auth, store/revoke/inspect record secrets
- `test/routes/assets.test.ts` — CRUD, dirty-queue marking, proof storage
- `test/routes/batch.test.ts` — route tests + full e2e `processBatch` (IPFS → Merkle → on-chain root via live Anvil)

### Contract (Forge)

`services/contract/test/FileRegistry.t.sol` — 25 tests covering ownership, `updateRoot`, checkpoint history, Merkle `verify` (1/2/3-leaf, wrong leaf/org), and all three events. Uses `forge-std` (submodule at `lib/forge-std`).
