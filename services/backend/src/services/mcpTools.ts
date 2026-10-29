import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Env } from "../index.js";
import { getAsset, listAssets, type AssetMeta } from "./assetStore.js";
import { saveAsset, saveNewAssets } from "./assetMutations.js";
import { getAdherence, listDoses, materializeDoses, reconcileStock, setDoseStatus } from "./doseStore.js";
import { addRecipient, listRecipients } from "./recipientStore.js";
import { identifier, type TokenGrant } from "./mcpTokens.js";

const text = z.string().trim().min(1).max(200);
const notes = z.string().max(10_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a valid YYYY-MM-DD date");
const timezone = text.refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Use an IANA timezone");
const times = z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(24);
const schedule = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("daily"), times }),
  z.strictObject({
    type: z.literal("weekdays"), times,
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  }),
  z.strictObject({
    type: z.literal("interval"), times,
    intervalHours: z.number().min(1).max(8760),
  }),
]);
const medicationFields = {
  dosage: text,
  form: text,
  instructions: notes.optional(),
  schedule,
  timezone,
  stock: z.strictObject({
    quantity: z.number().nonnegative(),
    unit: text,
    refillThreshold: z.number().nonnegative().optional(),
  }).optional(),
  recipientId: identifier,
  color: z.enum(["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"]).optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  active: z.boolean().optional(),
};
const medicationInput = z.strictObject({ name: text, ...medicationFields });
const medicationChanges = medicationInput.partial();
const recipientFilter = { recipientId: identifier.optional() };

class ToolError extends Error {}

function result(data: unknown, summary: string): CallToolResult {
  return {
    content: [{ type: "text", text: summary }, { type: "text", text: JSON.stringify(data) }],
    structuredContent: { data },
  };
}

export function createMcpServer(env: Env, grant: TokenGrant): McpServer {
  const server = new McpServer({ name: "quare-medications", version: "1.0.0" });
  const orgId = grant.orgId;

  function register<S extends z.ZodRawShape>(
    name: string,
    description: string,
    scope: "read" | "write",
    shape: S,
    action: (input: z.infer<z.ZodObject<S>>) => Promise<CallToolResult>
  ): void {
    server.registerTool<z.ZodRawShape, z.ZodObject<S>>(name, {
      description, inputSchema: z.strictObject(shape),
    }, async (input) => {
      if (!grant.scopes.includes(scope)) {
        return { isError: true, content: [{ type: "text", text: `Missing ${scope} scope` }] };
      }
      try {
        return await action(input as z.infer<z.ZodObject<S>>);
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: error instanceof ToolError ? error.message : "Operation failed; retry or contact the administrator",
          }],
        };
      }
    });
  }

  async function medication(recordId: string): Promise<AssetMeta> {
    const asset = await getAsset(env.ASSETS, orgId, recordId);
    if (asset?.kind !== "medication" || !asset.medication) throw new ToolError("Medication not found");
    return asset;
  }

  async function requireRecipient(recipientId: string): Promise<void> {
    if (!await env.ASSETS.get(`${orgId}:recipient:${recipientId}`)) {
      throw new ToolError("Recipient not found");
    }
  }

  async function update(recordId: string, changes: z.infer<typeof medicationChanges>) {
    const existing = await medication(recordId);
    if (changes.recipientId) await requireRecipient(changes.recipientId);
    const { name, ...details } = changes;
    const updated: AssetMeta = {
      ...existing,
      name: name ?? existing.name,
      medication: { ...existing.medication!, ...details },
      updatedAt: new Date().toISOString(),
    };
    if (updated.medication!.endDate && updated.medication!.endDate < updated.medication!.startDate) {
      throw new ToolError("endDate must not precede startDate");
    }
    return saveAsset(env, updated, existing);
  }

  register("list_recipients", "List care recipients in your organization.", "read", {}, async () =>
    result(await listRecipients(env.ASSETS, orgId), "Care recipients"));

  register("add_recipient", "Add a care recipient.", "write", {
    name: text, dateOfBirth: date.optional(), notes: notes.optional(),
  }, async (input) => {
    const recipient = await addRecipient(env.ASSETS, orgId, input);
    if (!recipient) throw new ToolError("Recipient already exists");
    return result(recipient, "Recipient added");
  });

  register("add_medications", "Add up to 100 medications; returns record IDs and QR scan URLs.", "write", {
    medications: z.array(medicationInput).min(1).max(100),
  }, async ({ medications }) => {
    const appUrl = env.APP_URL;
    if (!appUrl || !/^https?:\/\//.test(appUrl)) throw new ToolError("APP_URL is not configured");
    for (const input of medications) {
      await requireRecipient(input.recipientId);
      if (input.endDate && input.endDate < (input.startDate ?? localDate(input.timezone))) {
        throw new ToolError("endDate must not precede startDate");
      }
    }
    const assets: AssetMeta[] = medications.map(({ name, ...details }) => {
      const now = new Date().toISOString();
      return {
        recordId: crypto.randomUUID(), orgId, name, kind: "medication",
        status: "In use", location: "", assignee: details.recipientId,
        category: "Medication", fields: {}, files: [],
        medication: {
          ...details, color: details.color ?? "blue", active: details.active ?? true,
          startDate: details.startDate ?? localDate(details.timezone),
        },
        createdAt: now, updatedAt: now,
      };
    });
    await saveNewAssets(env, orgId, assets);
    await materializeDoses(orgId, env);
    const created = assets.map(({ recordId, name }) => ({
      recordId, name,
      scanUrl: `${appUrl.replace(/\/$/, "")}/scan?id=${encodeURIComponent(recordId)}`,
    }));
    return result(created, `${created.length} medications added`);
  });

  register("update_medication", "Update medication fields; omitted fields and stock are preserved.", "write", {
    recordId: identifier, changes: medicationChanges,
  }, async ({ recordId, changes }) => result(await update(recordId, changes), "Medication updated"));

  register("deactivate_medication", "Deactivate a medication and remove future pending doses.", "write", {
    recordId: identifier,
  }, async ({ recordId }) => result(await update(recordId, { active: false }), "Medication deactivated"));

  register("set_routine", "Replace a medication schedule, optionally changing its timezone.", "write", {
    recordId: identifier, schedule, timezone: timezone.optional(),
  }, async ({ recordId, schedule, timezone }) =>
    result(await update(recordId, { schedule, ...(timezone ? { timezone } : {}) }), "Routine replaced"));

  register("list_due", "List pending doses in the past/upcoming window (up to 168 hours).", "read", {
    windowHours: z.number().positive().max(168).default(12), ...recipientFilter,
  }, async ({ windowHours, recipientId }) => {
    await materializeDoses(orgId, env, Math.max(36, windowHours));
    const now = Date.now();
    const doses = await listDoses(orgId, env, {
      from: new Date(now - windowHours * 3_600_000).toISOString(),
      to: new Date(now + windowHours * 3_600_000).toISOString(),
      recipientId, status: "pending",
    });
    return result(doses, `${doses.length} pending doses`);
  });

  register("log_dose", "Log by doseId, or medicationName and ISO time (nearest pending dose within 24h). Use recipientId to disambiguate.", "write", {
    doseId: identifier.optional(),
    medicationName: text.optional(),
    time: z.iso.datetime({ offset: true }).optional(),
    ...recipientFilter,
    status: z.enum(["pending", "taken", "missed", "skipped", "rescheduled"]),
    notes: notes.optional(),
  }, async ({ doseId, medicationName, time, recipientId, status, notes }) => {
    if (doseId && (medicationName || time || recipientId)) {
      throw new ToolError("Provide doseId alone, or medicationName and time with optional recipientId");
    }
    if (!doseId) {
      if (!medicationName || !time) throw new ToolError("Provide doseId or medicationName and time");
      const target = new Date(time).getTime();
      await materializeDoses(orgId, env, 168);
      const doses = (await listDoses(orgId, env, {
        from: new Date(target - 86_400_000).toISOString(),
        to: new Date(target + 86_400_000).toISOString(), recipientId, status: "pending",
      })).filter((dose) => dose.medicationName.toLowerCase() === medicationName.toLowerCase());
      if (new Set(doses.map((dose) => dose.medicationId)).size > 1) {
        throw new ToolError("Medication name is ambiguous; use doseId or recipientId");
      }
      doses.sort((a, b) => Math.abs(Date.parse(a.scheduledAt) - target) - Math.abs(Date.parse(b.scheduledAt) - target));
      if (!doses.length) throw new ToolError("Pending dose not found within 24 hours");
      if (doses[1] && Math.abs(Date.parse(doses[0].scheduledAt) - target) ===
        Math.abs(Date.parse(doses[1].scheduledAt) - target)) {
        throw new ToolError("Two doses are equally close; use doseId");
      }
      doseId = doses[0].id;
    }
    const dose = await setDoseStatus(orgId, env, doseId, status, "mcp", notes);
    if (!dose) throw new ToolError("Dose not found");
    return result(dose, "Dose logged");
  });

  register("get_adherence", "Get taken/missed counts and adherence (null without observations).", "read", {
    days: z.number().int().min(1).max(366).default(30), ...recipientFilter,
  }, async ({ days, recipientId }) => result(await getAdherence(orgId, env, {
    from: new Date(Date.now() - days * 86_400_000).toISOString(),
    to: new Date().toISOString(), recipientId,
  }), "Adherence summary"));

  register("refill_status", "List medications with stock at or below their refillThreshold.", "read", {
    ...recipientFilter,
  }, async ({ recipientId }) => {
    await reconcileStock(orgId, env);
    const assets = (await listAssets(env.ASSETS, orgId)).filter((asset) =>
      asset.kind === "medication" && asset.medication?.stock?.refillThreshold !== undefined &&
      asset.medication.stock.quantity <= asset.medication.stock.refillThreshold &&
      (!recipientId || asset.medication.recipientId === recipientId));
    return result(assets, `${assets.length} medications need a refill`);
  });
  return server;
}

function localDate(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
