"use server";

import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import { tableToCsv } from "./csv-parser-helpers";
import { tableToXlsx } from "./xlsx-parser-helpers";

/**
 * Stage 6.P0.7-C.3 — Generic per-entity export.
 *
 * Returns a base64-encoded blob the client can trigger a download
 * for. Three formats:
 *   - csv: text/csv  (papaparse via tableToCsv)
 *   - xlsx: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (SheetJS via tableToXlsx)
 *   - json: application/json
 *
 * Authorization: requires internal user. RLS in the underlying queries
 * keeps per-org isolation honest.
 *
 * Filtered exports: callers pass `filters` JSON (entity-specific).
 * For now most entities export their full list; per-filter support
 * comes online when each entity's query module exposes a structured
 * filter (transactions already does — bankAccountId, direction,
 * reconciled).
 *
 * Large-dataset story (>10k rows): not yet implemented. The client
 * button warns. Future: signed-URL + cron + storage provider.
 */

const EXPORT_FORMATS = ["csv", "xlsx", "json"] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

const SUPPORTED_EXPORT_ENTITIES = [
  "transactions",
  "invoices",
  "vendors",
  "leads",
  "reservations",
  "buyers",
  "investors",
  "site_reports",
  "materials",
  "tasks",
  "qa_qc_issues",
  "inventory_items",
] as const;
type ExportEntity = (typeof SUPPORTED_EXPORT_ENTITIES)[number];

const inputSchema = z.object({
  entity: z.enum(SUPPORTED_EXPORT_ENTITIES),
  format: z.enum(EXPORT_FORMATS),
  filters: z.record(z.string(), z.unknown()).optional(),
});

const MAX_ROWS_INLINE = 10_000;

export interface EntityExportResult {
  ok: boolean;
  filename?: string;
  mimeType?: string;
  /** base64-encoded payload */
  base64?: string;
  rowCount?: number;
  error?: string;
}

/**
 * Project an array of records into the {headers, rows} shape used by
 * the format-encoders. Headers are the union of all keys across rows
 * (preserves first-seen order). bigint values get stringified — JSON
 * + CSV can't encode them natively.
 */
function projectAll(
  list: Array<Record<string, unknown>>,
): { headers: string[]; rows: Array<Record<string, unknown>> } {
  if (list.length === 0) return { headers: [], rows: [] };
  const headerSet: string[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        headerSet.push(k);
      }
    }
  }
  const rows = list.map((r) => {
    const out: Record<string, unknown> = {};
    for (const h of headerSet) {
      const v = r[h];
      if (typeof v === "bigint") out[h] = v.toString();
      else if (v instanceof Date) out[h] = v.toISOString();
      else out[h] = v ?? "";
    }
    return out;
  });
  return { headers: headerSet, rows };
}

/**
 * Fetch rows for an entity, applying minimal entity-specific shaping.
 * Returns a denormalized array of plain records ready for CSV/XLSX.
 */
async function fetchRowsForEntity(
  entity: ExportEntity,
): Promise<{ headers: string[]; rows: Array<Record<string, unknown>> }> {
  // Lazy-load the per-entity query modules so the export action's
  // import graph stays small and the wizard's page bundle is unaffected.
  switch (entity) {
    // Each entity case shapes a denormalised projection of the list
    // query result. We typecast the source rows as Record<string,unknown>
    // so the export stays robust against per-entity field renames; the
    // ListItem types themselves are the authoritative source of field
    // names + per-row data shapes for downstream consumers.
    case "transactions": {
      const { getTransactions } = await import(
        "@/lib/development/server/transactions"
      );
      const txs = (await getTransactions({}, { limit: MAX_ROWS_INLINE })) as unknown as Array<
        Record<string, unknown>
      >;
      return projectAll(txs);
    }
    case "invoices": {
      const { listInvoices } = await import(
        "@/lib/development/server/invoices/invoice-actions"
      );
      const list = (await listInvoices({})) as unknown as Array<Record<string, unknown>>;
      return projectAll(list);
    }
    case "vendors": {
      const { getVendors } = await import("@/lib/development/server/vendors");
      const list = (await getVendors()) as unknown as Array<Record<string, unknown>>;
      return projectAll(list);
    }
    case "buyers": {
      const { listBuyers } = await import(
        "@/lib/development/server/buyers/buyer-queries"
      );
      const list = (await listBuyers()) as unknown as Array<Record<string, unknown>>;
      return projectAll(list);
    }
    case "site_reports": {
      const { getSiteReports } = await import(
        "@/lib/development/server/site-reports"
      );
      const list = (await getSiteReports({})) as unknown as Array<Record<string, unknown>>;
      return projectAll(list);
    }
    case "materials": {
      const { getMaterialPurchaseOrders } = await import(
        "@/lib/development/server/materials"
      );
      const list = (await getMaterialPurchaseOrders()) as unknown as Array<
        Record<string, unknown>
      >;
      return projectAll(list);
    }
    case "reservations": {
      const { getReservations } = await import(
        "@/lib/development/server/reservations"
      );
      const list = (await getReservations()) as unknown as Array<Record<string, unknown>>;
      return projectAll(list);
    }
    case "leads": {
      const { getLeadsPipeline } = await import(
        "@/lib/development/server/leads"
      );
      const list = (await getLeadsPipeline()) as unknown as Array<Record<string, unknown>>;
      return projectAll(list);
    }
    case "investors": {
      const { getInvestors } = await import(
        "@/lib/development/server/investors"
      );
      const list = (await getInvestors()) as unknown as Array<Record<string, unknown>>;
      return projectAll(list);
    }
    case "tasks": {
      const { listProjectTasks } = await import(
        "@/lib/development/server/schedule/schedule-queries"
      );
      const list = (await listProjectTasks()) as unknown as Array<Record<string, unknown>>;
      return projectAll(list);
    }
    case "qa_qc_issues": {
      const { listQaQcIssues } = await import(
        "@/lib/development/server/qa-qc/qa-qc-queries"
      );
      const list = (await listQaQcIssues()) as unknown as Array<Record<string, unknown>>;
      return projectAll(list);
    }
    case "inventory_items": {
      const { listInventoryItems } = await import(
        "@/lib/development/server/inventory/inventory-queries"
      );
      const list = (await listInventoryItems()) as unknown as Array<Record<string, unknown>>;
      return projectAll(list);
    }
  }
}

export async function exportEntityData(
  input: z.input<typeof inputSchema>,
): Promise<EntityExportResult> {
  await requireInternalUser();
  requireDb();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { entity, format } = parsed.data;

  const { headers, rows } = await fetchRowsForEntity(entity);
  if (rows.length > MAX_ROWS_INLINE) {
    return {
      ok: false,
      error: `Export exceeds ${MAX_ROWS_INLINE}-row inline limit; signed-URL flow not yet implemented`,
    };
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const baseFilename = `${entity}-export-${stamp}`;

  if (format === "csv") {
    const csv = tableToCsv({ headers, rows });
    return {
      ok: true,
      filename: `${baseFilename}.csv`,
      mimeType: "text/csv",
      base64: Buffer.from(csv, "utf-8").toString("base64"),
      rowCount: rows.length,
    };
  }
  if (format === "xlsx") {
    const xlsx = tableToXlsx({ headers, rows });
    return {
      ok: true,
      filename: `${baseFilename}.xlsx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64: Buffer.from(xlsx).toString("base64"),
      rowCount: rows.length,
    };
  }
  // json
  const json = JSON.stringify(rows, null, 2);
  return {
    ok: true,
    filename: `${baseFilename}.json`,
    mimeType: "application/json",
    base64: Buffer.from(json, "utf-8").toString("base64"),
    rowCount: rows.length,
  };
}
