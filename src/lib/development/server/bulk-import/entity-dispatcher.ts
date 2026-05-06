"use server";

import { recordTransaction } from "@/lib/development/server/transaction-actions";
import { createVendor } from "@/lib/development/server/vendor-actions";
import { createBuyer } from "@/lib/development/server/buyers/buyer-actions";
import { createInvestor } from "@/lib/development/server/investor-actions";
import { createLead } from "@/lib/development/server/lead-actions";
import { createSiteReport } from "@/lib/development/server/site-report-actions";
import { createProjectTask } from "@/lib/development/server/schedule/schedule-actions";
import { createInventoryItem } from "@/lib/development/server/inventory/inventory-actions";
import { createQaQcIssue } from "@/lib/development/server/qa-qc/qa-qc-actions";
import type { BulkImportEntityType } from "@/lib/db/schema/bulk-import";

/**
 * Stage 6.P0.7-D — Per-entity insert dispatcher.
 *
 * Bridges between the bulk-import pipeline (which produces validated
 * row objects) and each entity's existing `create*` server action. The
 * pipeline owns FSM/job state; the dispatcher owns "for THIS entity,
 * how do we turn a row into a real DB write".
 *
 * Calling-convention notes:
 *   - Most actions take `input` objects (recordTransaction, createVendor,
 *     createBuyer, createInvestor, createSiteReport, createProjectTask,
 *     createInventoryItem, createQaQcIssue).
 *   - `createLead` takes FormData — we synthesize one from the row.
 *
 * Unsupported-for-bulk: `materials` (createMaterialPO needs line-items),
 * `invoices` (createInvoice needs line-items), `reservations` (FormData +
 * conflict checks beyond a flat row), `contacts` (no createContact action
 * exists — contacts are created as a side effect of buyer/lead/investor
 * flows). These return per-row errors with a clear message so operators
 * know why nothing got inserted.
 */

export interface EntityDispatchResult {
  successCount: number;
  failCount: number;
  createdIds: string[];
  errors: Array<{ rowIndex: number; field?: string; message: string }>;
}

export interface EntityDispatchInput {
  rows: Array<Record<string, unknown>>;
  /** Absolute index of `rows[0]` in the original source — preserves
   *  rowIndex correctness across batch boundaries when the cron picks
   *  the job back up partway through. */
  rowIndexOffset: number;
  options: { skipInvalid: boolean };
}

type Handler = (input: EntityDispatchInput) => Promise<EntityDispatchResult>;

function rowToFormData(row: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(row)) {
    if (v == null) continue;
    fd.set(k, typeof v === "string" ? v : String(v));
  }
  return fd;
}

async function dispatchEach(
  input: EntityDispatchInput,
  insertOne: (
    row: Record<string, unknown>,
  ) => Promise<{ id: string } | { ok: false; error: string }>,
): Promise<EntityDispatchResult> {
  const out: EntityDispatchResult = {
    successCount: 0,
    failCount: 0,
    createdIds: [],
    errors: [],
  };
  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i];
    const absIdx = input.rowIndexOffset + i;
    try {
      const result = await insertOne(row);
      if ("ok" in result && result.ok === false) {
        out.failCount += 1;
        out.errors.push({ rowIndex: absIdx, message: result.error });
        if (!input.options.skipInvalid) break;
      } else if ("id" in result) {
        out.successCount += 1;
        out.createdIds.push(result.id);
      } else {
        out.failCount += 1;
        out.errors.push({
          rowIndex: absIdx,
          message: "insert returned no id",
        });
        if (!input.options.skipInvalid) break;
      }
    } catch (e) {
      out.failCount += 1;
      out.errors.push({
        rowIndex: absIdx,
        message: e instanceof Error ? e.message : String(e),
      });
      if (!input.options.skipInvalid) break;
    }
  }
  return out;
}

const handlers: Record<BulkImportEntityType, Handler> = {
  transactions: (input) =>
    dispatchEach(input, async (row) => {
      const r = await recordTransaction(row as Parameters<typeof recordTransaction>[0]);
      return { id: r.id };
    }),

  vendors: (input) =>
    dispatchEach(input, async (row) => {
      const r = await createVendor(row as Parameters<typeof createVendor>[0]);
      return { id: r.id };
    }),

  buyers: (input) =>
    dispatchEach(input, async (row) => {
      const r = await createBuyer(row as Parameters<typeof createBuyer>[0]);
      return { id: r.id };
    }),

  investors: (input) =>
    dispatchEach(input, async (row) => {
      const r = await createInvestor(row as unknown as Parameters<typeof createInvestor>[0]);
      return { id: r.id };
    }),

  leads: (input) =>
    dispatchEach(input, async (row) => {
      const fd = rowToFormData(row);
      const result = await createLead(fd);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { id: result.contactRoleId };
    }),

  site_reports: (input) =>
    dispatchEach(input, async (row) => {
      const r = await createSiteReport(row as Parameters<typeof createSiteReport>[0]);
      return { id: r.id };
    }),

  tasks: (input) =>
    dispatchEach(input, async (row) => {
      const r = await createProjectTask(row as Parameters<typeof createProjectTask>[0]);
      return { id: r.id };
    }),

  inventory_items: (input) =>
    dispatchEach(input, async (row) => {
      const r = await createInventoryItem(row as Parameters<typeof createInventoryItem>[0]);
      return { id: r.id };
    }),

  qa_qc_issues: (input) =>
    dispatchEach(input, async (row) => {
      const r = await createQaQcIssue(row as Parameters<typeof createQaQcIssue>[0]);
      return { id: r.id };
    }),

  // Flat-row bulk insert isn't a clean fit for these — the corresponding
  // create actions require nested children (po_lines / invoice_lines) or
  // composite domain checks that a CSV row can't express. Operators
  // should use the per-entity form for these. We surface the reason
  // per-row so a 1000-row import doesn't "succeed" silently.
  materials: (input) =>
    dispatchEach(input, async () => ({
      ok: false,
      error:
        "Bulk import of materials POs is not supported — line items are required. Use the Materials form.",
    })),

  invoices: (input) =>
    dispatchEach(input, async () => ({
      ok: false,
      error:
        "Bulk import of invoices is not supported — line items are required. Use the Invoice form.",
    })),

  reservations: (input) =>
    dispatchEach(input, async () => ({
      ok: false,
      error:
        "Bulk import of reservations is not supported — conflict checks span existing bookings. Use the Reservation form.",
    })),

  contacts: (input) =>
    dispatchEach(input, async () => ({
      ok: false,
      error:
        "Direct bulk import of contacts is not supported — contacts are created via buyer/lead/investor imports. Choose the relevant entity instead.",
    })),
};

/**
 * Insert one batch of validated rows into the entity table.
 *
 * Each row is processed independently; one failure does not roll back
 * earlier successes in the same batch. Honors `skipInvalid`:
 *   - true (default for bulk): on row failure, log + continue.
 *   - false: on row failure, stop processing remaining rows and
 *     return what we got. The caller will see fewer rows in
 *     `successCount + failCount` than were submitted.
 */
export async function dispatchEntityInserts(
  entityType: BulkImportEntityType,
  input: EntityDispatchInput,
): Promise<EntityDispatchResult> {
  const handler = handlers[entityType];
  if (!handler) {
    return {
      successCount: 0,
      failCount: input.rows.length,
      createdIds: [],
      errors: input.rows.map((_, i) => ({
        rowIndex: input.rowIndexOffset + i,
        message: `No dispatcher registered for entity '${entityType}'`,
      })),
    };
  }
  return handler(input);
}
