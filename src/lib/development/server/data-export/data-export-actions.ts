"use server";
import "server-only";

import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { dataExportRequests } from "@/lib/db/schema/saas";
import {
  formatExport,
  type ExportFormat,
  type ExportTable,
} from "./export-helpers";

const requestSchema = z.object({
  organizationId: z.string().uuid(),
  requestedBy: z.string().uuid(),
  exportScope: z.enum([
    "full_organization",
    "projects_only",
    "financials_only",
    "users_only",
    "ai_logs_only",
    "custom_subset",
  ]),
  customTables: z.array(z.string()).optional(),
  exportFormat: z.enum(["json", "csv", "sql"]).default("json"),
  notes: z.string().max(500).optional(),
});

export async function requestDataExport(input: z.input<typeof requestSchema>) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const inserted = await db
    .insert(dataExportRequests)
    .values({
      organizationId: parsed.data.organizationId,
      requestedBy: parsed.data.requestedBy,
      exportScope: parsed.data.exportScope,
      customTables: parsed.data.customTables ?? null,
      exportFormat: parsed.data.exportFormat,
      notes: parsed.data.notes ?? null,
    })
    .returning({ id: dataExportRequests.id });
  return { ok: true as const, exportRequestId: inserted[0].id };
}

const SCOPE_TABLES: Record<string, string[]> = {
  full_organization: [
    "projects",
    "dev_transactions",
    "dev_invoices",
    "investors",
    "leads",
    "agent_invocation_log",
    "app_users",
  ],
  projects_only: ["projects"],
  financials_only: ["dev_transactions", "dev_invoices"],
  users_only: ["app_users"],
  ai_logs_only: ["agent_invocation_log", "agent_outputs", "project_ai_memory"],
  custom_subset: [],
};

const ALLOWED_EXPORT_TABLES = new Set([
  "projects",
  "villas",
  "dev_transactions",
  "dev_invoices",
  "investors",
  "leads",
  "agent_invocation_log",
  "agent_outputs",
  "project_ai_memory",
  "app_users",
  "campaigns",
  "campaign_costs",
  "capital_commitments",
  "capital_drawdowns",
  "distributions",
  "wallet_movements",
]);

async function gatherTablesForScope(
  organizationId: string,
  scope: string,
  customTables: string[] | null,
): Promise<ExportTable[]> {
  const db = getDb();
  if (!db) return [];
  const tableNames =
    scope === "custom_subset"
      ? (customTables ?? []).filter((t) => ALLOWED_EXPORT_TABLES.has(t))
      : SCOPE_TABLES[scope] ?? [];

  const out: ExportTable[] = [];
  for (const name of tableNames) {
    if (!ALLOWED_EXPORT_TABLES.has(name)) continue;
    try {
      const rows = await db.execute(
        sql`SELECT * FROM ${sql.identifier(name)} WHERE organization_id = ${organizationId}`,
      );
      out.push({
        tableName: name,
        rows: rows as unknown as Array<Record<string, unknown>>,
      });
    } catch {
      // Skip tables where the org column may not exist or query fails;
      // a partial export is preferable to a hard failure.
      out.push({ tableName: name, rows: [] });
    }
  }
  return out;
}

/**
 * Process one queued export. Picks a `pending` row, gathers tables,
 * and stores the formatted output as a data: URI (prototype storage).
 */
export async function processExportRequest(args: { exportRequestId: string }) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };

  const rows = await db
    .select()
    .from(dataExportRequests)
    .where(eq(dataExportRequests.id, args.exportRequestId))
    .limit(1);
  const req = rows[0];
  if (!req) return { ok: false as const, error: "Request not found" };
  if (req.status !== "pending") {
    return { ok: false as const, error: `Request status: ${req.status}` };
  }

  await db
    .update(dataExportRequests)
    .set({ status: "processing", startedAt: new Date() })
    .where(eq(dataExportRequests.id, req.id));

  try {
    const tables = await gatherTablesForScope(
      req.organizationId,
      req.exportScope,
      req.customTables,
    );
    const formatted = formatExport(tables, req.exportFormat as ExportFormat);
    const sizeBytes = Buffer.byteLength(formatted.content, "utf8");
    const dataUri = `data:${formatted.mimeType};base64,${Buffer.from(
      formatted.content,
      "utf8",
    ).toString("base64")}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db
      .update(dataExportRequests)
      .set({
        status: "completed",
        completedAt: new Date(),
        outputSizeBytes: BigInt(sizeBytes),
        downloadUrl: dataUri,
        downloadExpiresAt: expiresAt,
      })
      .where(eq(dataExportRequests.id, req.id));
    return { ok: true as const, sizeBytes, tables: tables.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    await db
      .update(dataExportRequests)
      .set({
        status: "failed",
        errorMessage: msg,
        completedAt: new Date(),
      })
      .where(eq(dataExportRequests.id, req.id));
    return { ok: false as const, error: msg };
  }
}

export async function processPendingExportRequests(
  args: { limit?: number } = {},
) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const pending = await db
    .select({ id: dataExportRequests.id })
    .from(dataExportRequests)
    .where(eq(dataExportRequests.status, "pending"))
    .limit(args.limit ?? 25);
  let processed = 0;
  let failed = 0;
  for (const p of pending) {
    const r = await processExportRequest({ exportRequestId: p.id });
    if (r.ok) processed += 1;
    else failed += 1;
  }
  return { ok: true as const, processed, failed };
}

export async function deleteExpiredExports() {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured", pruned: 0 };
  const now = new Date();
  const expired = await db
    .select({
      id: dataExportRequests.id,
      exp: dataExportRequests.downloadExpiresAt,
    })
    .from(dataExportRequests)
    .where(eq(dataExportRequests.status, "completed"));
  let pruned = 0;
  for (const r of expired) {
    if (r.exp && r.exp.getTime() < now.getTime()) {
      await db
        .update(dataExportRequests)
        .set({ downloadUrl: null })
        .where(eq(dataExportRequests.id, r.id));
      pruned += 1;
    }
  }
  return { ok: true as const, pruned };
}

export async function listExportRequestsForOrg(organizationId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(dataExportRequests)
    .where(
      and(
        eq(dataExportRequests.organizationId, organizationId),
      ),
    );
}
