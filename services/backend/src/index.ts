import { handlePreflight, corsHeaders } from "./utils/cors.js";
import { handlePinVerify } from "./routes/pin.js";
import { handleFileGet } from "./routes/files.js";
import { handleAdmin } from "./routes/admin.js";
import { handleAssets } from "./routes/assets.js";
import { handleBatch } from "./routes/batch.js";
import { processBatch } from "./services/batchProcessor.js";
import { handleMedications } from "./routes/medications.js";
import { handleDoses, handleAdherence } from "./routes/doses.js";
import { handleRecipients } from "./routes/recipients.js";
import { materializeDoses, markMissed, reconcileStock } from "./services/doseStore.js";
import type { AssetMeta } from "./services/assetStore.js";

export interface Env {
  DB: D1Database;
  CONTRACT_ADDRESS: string;
  CHAIN_RPC_URL: string;
  ALLOWED_ORIGINS: string;
  RECORD_SECRETS: KVNamespace;
  ADMIN_KEY: string;
  ASSETS: KVNamespace;
  BATCH_QUEUE: KVNamespace;
  W3UP_TOKEN: string;
  DEPLOYER_PRIVATE_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const preflight = handlePreflight(request, env.ALLOWED_ORIGINS);
    if (preflight) return preflight;

    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;

    // GET /api/health
    if (method === "GET" && pathname === "/api/health") {
      return Response.json({ status: "ok" }, { headers: corsHeaders(env.ALLOWED_ORIGINS) });
    }

    // /api/medications/* routes
    if (pathname.startsWith("/api/medications")) {
      return handleMedications(request, env, pathname);
    }

    // /api/doses/* routes
    if (pathname.startsWith("/api/doses")) {
      return handleDoses(request, env, pathname);
    }

    if (pathname.startsWith("/api/adherence")) {
      return handleAdherence(request, env, pathname);
    }

    // /api/recipients routes
    if (pathname.startsWith("/api/recipients")) {
      return handleRecipients(request, env, pathname);
    }

    // /admin/* routes
    if (pathname.startsWith("/admin/")) {
      return handleAdmin(request, env, pathname);
    }

    // /assets/* routes
    if (pathname.startsWith("/assets/")) {
      return handleAssets(request, env, pathname);
    }

    // /batch/* routes
    if (pathname.startsWith("/batch/")) {
      return handleBatch(request, env, pathname);
    }

    // POST /pin/verify
    if (method === "POST" && pathname === "/pin/verify") {
      return handlePinVerify(request, env);
    }

    // GET /files/:cid
    const filesMatch = pathname.match(/^\/files\/(.+)$/);
    if (method === "GET" && filesMatch) {
      return handleFileGet(request, env, filesMatch[1]);
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: corsHeaders(env.ALLOWED_ORIGINS),
    });
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    if (event.cron === "* * * * *") {
      const orgIds = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await env.ASSETS.list({ cursor });
        for (const key of page.keys) {
          if (!key.name.includes(":asset:")) continue;
          const value = await env.ASSETS.get(key.name);
          const asset = value ? JSON.parse(value) as AssetMeta : null;
          if (asset?.kind === "medication" && asset.medication) orgIds.add(asset.orgId);
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      for (const orgId of orgIds) {
        await materializeDoses(orgId, env);
        await markMissed(orgId, env);
        await reconcileStock(orgId, env);
      }
      return;
    }
    if (event.cron !== "*/5 * * * *") return;
    const result = await env.BATCH_QUEUE.list();
    const orgIds = [
      ...new Set(
        result.keys
          .filter((k) => k.name.endsWith(":batch:pending"))
          .map((k) => k.name.replace(/:batch:pending$/, ""))
      ),
    ];

    await Promise.all(
      orgIds.map((orgId) => processBatch(orgId, env, env.DEPLOYER_PRIVATE_KEY))
    );
  },
};
