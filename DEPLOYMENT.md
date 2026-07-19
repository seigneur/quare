# Deployment Guide

Two independent deployment targets:

| Layer | Where | Command |
|-------|-------|---------|
| Frontend (static) | GitHub Pages | `npm run export` → `apps/web/out/` |
| Backend API | Cloudflare Workers | `npm run deploy` from `services/backend/` |

Full stack deployment order: **contract → backend worker → web frontend**.

---

## 1. Deploy the contract (`services/contract/`)

### Prerequisites

- [Foundry](https://getfoundry.sh): `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- A funded wallet on Base mainnet

### Compile and test

```bash
cd services/contract
PATH="$HOME/.foundry/bin:$PATH" forge build
PATH="$HOME/.foundry/bin:$PATH" forge test -vv
```

### Deploy to Base mainnet

```bash
PRIVATE_KEY=0x<deployer-key> \
RPC_URL=https://mainnet.base.org \
npx ts-node deploy.ts
```

Copy the printed contract address — you need it in the next step.

---

## 2. Deploy the backend Worker (`services/backend/`)

### Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler` + `wrangler login`
- A Cloudflare account with Workers enabled

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

Fill the returned IDs into `wrangler.toml`.

### Configure `wrangler.toml`

```toml
[vars]
CONTRACT_ADDRESS = "0x<deployed contract address>"
CHAIN_RPC_URL    = "https://mainnet.base.org"
# Set to your GitHub Pages URL (or "*" for dev)
ALLOWED_ORIGINS  = "https://<username>.github.io"
ADMIN_KEY        = ""   # set via wrangler secret (below)
W3UP_TOKEN       = ""   # set via wrangler secret (below)
```

### Set secrets

```bash
wrangler secret put DEPLOYER_PRIVATE_KEY
wrangler secret put ADMIN_KEY
wrangler secret put W3UP_TOKEN
```

### Install and deploy

```bash
npm install
npm run deploy
```

Note the worker URL: `https://quare-backend.<account>.workers.dev`

**New medication management API endpoints (mock data — ready to use):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/recipients` | List care recipients |
| GET | `/api/medications` | List medications |
| GET | `/api/medications/:id/explain` | Plain-language medication insight |
| GET | `/api/doses/due` | Today's dose schedule |
| POST | `/api/doses/:id/status` | Update dose status (`taken`, `missed`, `skipped`, …) |

---

## 3. Deploy the frontend to GitHub Pages

### Automatic deployment (recommended)

1. Push to the `main` branch — the workflow at `.github/workflows/deploy-pages.yml` runs automatically.
2. On first deploy, enable GitHub Pages in repository **Settings → Pages → Source: GitHub Actions**.
3. (Optional) Add repository variables/secrets in **Settings → Secrets and variables → Actions**:
   - Secret `NEXT_PUBLIC_API_URL` — your Worker URL
   - Variable `NEXT_PUBLIC_BASE_PATH` — set to `/<repo-name>` for project sites (e.g. `/quare`); leave empty for a custom domain

### Manual deployment

```bash
cd apps/web
npm install

# For a project site at https://<user>.github.io/<repo>:
NEXT_PUBLIC_BASE_PATH=/<repo-name> \
NEXT_PUBLIC_API_URL=https://quare-backend.<account>.workers.dev \
npm run export
# Static files are in apps/web/out/ — upload to GitHub Pages
```

### Local development (frontend only, mock data)

```bash
cd apps/web
npm install
npm run dev      # http://localhost:3000
```

No API URL is needed — the app falls back to mock data automatically.

---

## 4. Local development (full stack)

```bash
# Terminal 1 — backend Worker
cd services/backend
npm install
npm run dev       # wrangler dev → http://localhost:8787

# Terminal 2 — frontend
cd apps/web
npm install
NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev
```

---

## Environment variable reference

| Variable | Where | Description |
|----------|-------|-------------|
| `CONTRACT_ADDRESS` | `wrangler.toml` | Deployed FileRegistry address |
| `CHAIN_RPC_URL` | `wrangler.toml` | Base mainnet RPC |
| `ALLOWED_ORIGINS` | `wrangler.toml` | CORS allowed origins (`*` for dev, your Pages URL for prod) |
| `DEPLOYER_PRIVATE_KEY` | wrangler secret | Key that deployed the contract |
| `ADMIN_KEY` | wrangler secret | Shared secret for `X-Admin-Key` header |
| `W3UP_TOKEN` | wrangler secret | web3.storage upload token |
| `NEXT_PUBLIC_API_URL` | web `.env` / GitHub secret | Worker URL (empty → mock data) |
| `NEXT_PUBLIC_BASE_PATH` | web `.env` / GitHub variable | Base path for GitHub project sites |

---

## What is missing / TODO for production

- **Persistent dose storage**: `POST /api/doses/:id/status` currently uses in-memory overrides (reset on Worker restart). Wire up KV or D1 for persistence.
- **Medication CRUD**: `POST /api/medications` and `DELETE /api/medications/:id` are not yet implemented.
- **Recipient CRUD**: `POST /api/recipients` not yet implemented.
- **AI-powered medication insights**: `GET /api/medications/:id/explain` returns mock data. Integrate a pharmacological data source or LLM in production.
- **Full dose history**: The history page shows today's doses only. Add date-range querying.
- **Authentication**: No user authentication is implemented. Add Workers Auth or a JWT layer before production use.
- **Push notifications / reminders**: Not yet implemented.

---

## Re-deploying after contract changes

1. Run `forge test -vv`
2. Re-deploy contract: `PRIVATE_KEY=... RPC_URL=... npx ts-node deploy.ts`
3. Update `CONTRACT_ADDRESS` in `wrangler.toml`
4. Re-deploy the worker: `npm run deploy` (from `services/backend/`)
5. Re-commit batch via `POST /batch/:orgId/process`
