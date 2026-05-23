# Deployment Guide

Full deployment: contract → backend worker → web frontend. Do them in order.

## Prerequisites

- Node.js 18+
- [Foundry](https://getfoundry.sh) — `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — `npm install -g wrangler` + `wrangler login`
- A funded wallet on Base mainnet (for contract deploy gas)
- A [web3.storage](https://web3.storage) account — get a `W3UP_TOKEN`
- A Cloudflare account with Workers enabled

---

## 1. Deploy the contract (`services/contract/`)

### Compile

```bash
cd services/contract
PATH="/home/nanoclaw/.foundry/bin:$PATH" forge build
```

The ABI and bytecode land in `out/FileRegistry.sol/FileRegistry.json`.

### Run tests before deploying

```bash
PATH="/home/nanoclaw/.foundry/bin:$PATH" forge test -vv
# Expected: 25 passed (FileRegistry.t.sol) + 3 failed exploits (fixes confirmed)
```

### Deploy to Base mainnet

```bash
PRIVATE_KEY=0x<deployer-key> \
RPC_URL=https://mainnet.base.org \
npx ts-node deploy.ts
```

`deploy.ts` reads bytecode from `out/FileRegistry.sol/FileRegistry.json` via forge's artifact format. Copy the printed contract address — you'll need it in step 2.

> The deployer address is auto-approved as an org in the constructor. Use the same
> private key as `DEPLOYER_PRIVATE_KEY` in the worker secrets below.

### (Optional) Verify on Basescan

```bash
PATH="/home/nanoclaw/.foundry/bin:$PATH" forge verify-contract \
  <CONTRACT_ADDRESS> \
  FileRegistry \
  --chain base \
  --etherscan-api-key <BASESCAN_API_KEY>
```

---

## 2. Deploy the backend worker (`services/backend/`)

### Create KV namespaces

```bash
cd services/backend
wrangler kv:namespace create ASSETS
wrangler kv:namespace create ASSETS --preview
wrangler kv:namespace create BATCH_QUEUE
wrangler kv:namespace create BATCH_QUEUE --preview
wrangler kv:namespace create RECORD_SECRETS
wrangler kv:namespace create RECORD_SECRETS --preview
```

Each command prints an `id`. Fill them into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RECORD_SECRETS"
id = "<id from above>"
preview_id = "<preview id>"

[[kv_namespaces]]
binding = "ASSETS"
id = "<id>"
preview_id = "<preview id>"

[[kv_namespaces]]
binding = "BATCH_QUEUE"
id = "<id>"
preview_id = "<preview id>"
```

### Set vars in `wrangler.toml`

```toml
[vars]
CONTRACT_ADDRESS = "0x<deployed contract address>"
CHAIN_RPC_URL    = "https://mainnet.base.org"
ALLOWED_ORIGINS  = "https://your-domain.com"
ADMIN_KEY        = ""   # leave blank — set as a secret below
W3UP_TOKEN       = ""   # leave blank — set as a secret below
```

### Set secrets (never committed to git)

```bash
wrangler secret put DEPLOYER_PRIVATE_KEY   # same key used to deploy contract
wrangler secret put ADMIN_KEY              # random string, used for X-Admin-Key header
wrangler secret put W3UP_TOKEN             # from web3.storage dashboard
```

### Install deps and deploy

```bash
npm install
npm run deploy
```

Note the worker URL (e.g. `https://quare-backend.<account>.workers.dev`).

---

## 3. Deploy the web frontend (`apps/web/`)

### Set environment variables

Create `apps/web/.env.production.local`:

```
NEXT_PUBLIC_API_URL=https://quare-backend.<account>.workers.dev
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Build and deploy

The web app is a standard Next.js 15 app. Deploy to Vercel (recommended):

```bash
cd apps/web
npm install
npm run build      # verify locally first
npx vercel --prod
```

Or export as static and deploy to any CDN:

```bash
npm run build
# output in .next/ — configure your hosting accordingly
```

---

## Environment variable reference

| Variable | Where set | Description |
|----------|-----------|-------------|
| `CONTRACT_ADDRESS` | `wrangler.toml` `[vars]` | Deployed FileRegistry address |
| `CHAIN_RPC_URL` | `wrangler.toml` `[vars]` | Base mainnet RPC (e.g. `https://mainnet.base.org`) |
| `ALLOWED_ORIGINS` | `wrangler.toml` `[vars]` | CORS allowed origins (`*` for dev) |
| `DEPLOYER_PRIVATE_KEY` | wrangler secret | Key that deployed the contract (auto-approved as org) |
| `ADMIN_KEY` | wrangler secret | Shared secret for `X-Admin-Key` header on admin/batch routes |
| `W3UP_TOKEN` | wrangler secret | web3.storage upload token |
| `NEXT_PUBLIC_API_URL` | web `.env` | Worker URL |
| `NEXT_PUBLIC_APP_URL` | web `.env` | Frontend URL (used for QR deep-link generation) |

---

## Re-deploying after contract changes

If `FileRegistry.sol` changes (e.g. after a security fix):

1. Run the full test suite: `forge test -vv`
2. Deploy the new contract: `PRIVATE_KEY=... RPC_URL=... npx ts-node deploy.ts`
3. Update `CONTRACT_ADDRESS` in `wrangler.toml`
4. Re-deploy the worker: `npm run deploy` (from `services/backend/`)
5. Existing KV data (assets, proofs) is unaffected — only on-chain roots need to
   be re-committed via `POST /batch/:orgId/process` after the new contract is live.
