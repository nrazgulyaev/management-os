"use server";

/**
 * Statement-import upload action.
 *
 * First (and only) caller of `createStatementImport` (src/lib/banking/
 * service.ts) — wires the operator-facing upload form to the Stage 6.P3
 * parser library (CSV / OFX / MT940) and the `bank_transactions`
 * ingestion path. PDF parsing exists (`parsePdfText`) but expects
 * pre-extracted text, so PDF uploads are intentionally NOT accepted
 * here — the UI says so instead of pretending.
 *
 * Flow:
 *   1. auth gate (banking.write) + org scope (requireOrgId)
 *   2. verify the target bank connection belongs to the caller's org
 *   3. route the file to the right parser (explicit format or
 *      extension/content sniff)
 *   4. createStatementImport → insert parsed rows with the same
 *      idempotent dedupe the API-sync path uses (UNIQUE on
 *      bank_connection_id + external_transaction_id)
 *   5. updateStatementImportStatus with honest counts + error log
 *   6. best-effort auto-reconciliation pass + audit event
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  bankConnections,
  bankTransactions,
  type ImportSource,
} from "@/lib/db/schema/banking";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  autoDetectColumnMapping,
  detectCsvDialect,
  parseCsvStatement,
  parseMt940Statement,
  parseOfxStatement,
  type CSVColumnMapping,
  type CSVParseOptions,
  type ParseResult,
} from "@/lib/banking/parsers";
import { getCsvTemplate } from "@/lib/banking/templates/csv-templates";
import {
  createStatementImport,
  runAutoReconciliation,
  updateStatementImportStatus,
} from "@/lib/banking/service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportLineError {
  rowIndex: number;
  reason: string;
}

export type UploadFormat = "csv" | "ofx" | "mt940";

export type ImportStatementResult =
  | {
      ok: true;
      importCode: string;
      format: UploadFormat;
      totalRows: number;
      imported: number;
      skipped: number;
      failed: number;
      /** Auto-matcher pass after import; null when the pass errored. */
      autoMatched: number | null;
      lineErrors: ImportLineError[];
      lineErrorsTruncated: boolean;
    }
  | {
      ok: false;
      error: string;
      lineErrors?: ImportLineError[];
    };

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB — statements are text files.
const MAX_LINE_ERRORS_RETURNED = 20;
const MAX_LINE_ERRORS_STORED = 200;

const inputSchema = z.object({
  bankConnectionId: z.string().uuid(),
  format: z.enum(["auto", "csv", "ofx", "mt940"]),
  csvTemplateId: z.string().max(80).optional(),
});

// bank_transactions.import_source CHECK has no mt940-specific value
// (api/csv_upload/ofx_upload/pdf_upload/email_parsed/manual_entry).
// manual_entry is the closest provenance; import_job_id still links each
// row back to the statement_imports record.
const IMPORT_SOURCE_BY_FORMAT: Record<UploadFormat, ImportSource> = {
  csv: "csv_upload",
  ofx: "ofx_upload",
  mt940: "manual_entry",
};

// ---------------------------------------------------------------------------
// Format + CSV-mapping resolution
// ---------------------------------------------------------------------------

function detectFormat(filename: string, content: string): UploadFormat | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") return "csv";
  if (ext === "ofx" || ext === "qfx") return "ofx";
  if (ext === "mt940" || ext === "sta" || ext === "940") return "mt940";
  // .txt / unknown extension — sniff the content.
  const head = content.slice(0, 2000).trimStart();
  if (/^OFXHEADER/i.test(head) || /<OFX/i.test(head)) return "ofx";
  if (/^:20:/m.test(content) && /^:61:/m.test(content)) return "mt940";
  if (head.includes(",") || head.includes(";") || head.includes("\t")) {
    return "csv";
  }
  return null;
}

function resolveCsvSetup(
  content: string,
  csvTemplateId: string | undefined,
):
  | { ok: true; mapping: CSVColumnMapping; options: CSVParseOptions }
  | { ok: false; error: string } {
  if (csvTemplateId && csvTemplateId !== "auto") {
    const template = getCsvTemplate(csvTemplateId);
    if (!template) {
      return { ok: false, error: `Unknown CSV template "${csvTemplateId}".` };
    }
    return {
      ok: true,
      mapping: template.defaultMapping,
      options: template.defaultOptions ?? {},
    };
  }

  // Auto-detect: read the header row with the detected delimiter, then
  // run the header heuristics shipped with the parser library.
  const dialect = detectCsvDialect(content);
  if (!dialect.hasHeader) {
    return {
      ok: false,
      error:
        "This CSV has no header row, so columns cannot be auto-detected. Pick a bundled template that matches the bank export.",
    };
  }
  const headerLine = content
    .split(/\r?\n/)
    .find((l) => l.trim().length > 0);
  if (!headerLine) {
    return { ok: false, error: "The CSV file is empty." };
  }
  const headers = headerLine
    .split(dialect.delimiter)
    .map((h) => h.trim().replace(/^"|"$/g, ""));
  const detected = autoDetectColumnMapping(headers);
  const hasAmount =
    !!detected.amount || (!!detected.debit && !!detected.credit);
  if (!detected.date || !detected.description || !hasAmount) {
    return {
      ok: false,
      error: `Could not auto-detect the required columns (need date + description + amount, or debit/credit). Found headers: ${headers.join(", ")}. Pick a bundled CSV template instead.`,
    };
  }
  return {
    ok: true,
    mapping: detected as CSVColumnMapping,
    options: {
      amountSign:
        detected.debit && detected.credit ? "separate_columns" : "mixed",
      source: "csv",
    },
  };
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function importStatementAction(
  formData: FormData,
): Promise<ImportStatementResult> {
  try {
    await requirePermission("banking.write");
    const organizationId = await requireOrgId();
    const me = await getCurrentAppUser();
    if (!me) {
      return { ok: false, error: "No authenticated user session." };
    }

    const parsed = inputSchema.safeParse({
      bankConnectionId: String(formData.get("bankConnectionId") ?? ""),
      format: String(formData.get("format") ?? "auto"),
      csvTemplateId:
        String(formData.get("csvTemplateId") ?? "").trim() || undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid form input.",
      };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Pick a statement file to upload." };
    }
    if (file.size > MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB. Split the statement by period and retry.`,
      };
    }

    const db = requireDb();

    // Org-scope the connection lookup — the WHERE includes organization_id
    // so a foreign connection id cannot be used to write into another
    // tenant (write-flow audit pattern).
    const [conn] = await db
      .select({
        id: bankConnections.id,
        currency: bankConnections.currency,
        status: bankConnections.status,
      })
      .from(bankConnections)
      .where(
        and(
          eq(bankConnections.id, parsed.data.bankConnectionId),
          eq(bankConnections.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!conn) {
      return {
        ok: false,
        error: "Bank connection not found in your organization.",
      };
    }
    if (conn.status === "archived") {
      return {
        ok: false,
        error: "That bank connection is archived — pick an active one.",
      };
    }

    const content = await file.text();
    const format =
      parsed.data.format === "auto"
        ? detectFormat(file.name, content)
        : parsed.data.format;
    if (!format) {
      return {
        ok: false,
        error:
          "Could not detect the file format from the extension or content. Pick CSV / OFX / MT940 explicitly.",
      };
    }

    // Parse — every parser returns the same ParseResult envelope.
    let parseResult: ParseResult;
    let columnMapping: Record<string, unknown> | undefined;
    if (format === "csv") {
      const setup = resolveCsvSetup(content, parsed.data.csvTemplateId);
      if (!setup.ok) return { ok: false, error: setup.error };
      columnMapping = { ...setup.mapping };
      parseResult = await parseCsvStatement(content, setup.mapping, {
        ...setup.options,
        defaultCurrency: setup.options.defaultCurrency ?? conn.currency,
      });
    } else if (format === "ofx") {
      parseResult = await parseOfxStatement(content);
    } else {
      parseResult = parseMt940Statement(content);
    }

    const { rows, diagnostics } = parseResult;
    const parseErrors: ImportLineError[] = diagnostics.rowsFailed.map(
      (f) => ({ rowIndex: f.rowIndex, reason: f.reason }),
    );

    if (rows.length === 0) {
      return {
        ok: false,
        error:
          parseErrors.length > 0
            ? `No rows could be parsed (${parseErrors.length} parse failures).`
            : "The file parsed but contained no statement lines.",
        lineErrors: parseErrors.slice(0, MAX_LINE_ERRORS_RETURNED),
      };
    }

    // Create the statement_imports record via the existing service fn.
    const created = await createStatementImport({
      organizationId,
      bankConnectionId: conn.id,
      format,
      filename: file.name,
      fileSizeBytes: file.size,
      uploadedBy: me.id,
      columnMapping,
    });
    if (!created.ok || !created.importId || !created.importCode) {
      return {
        ok: false,
        error: created.error ?? "Could not create the import record.",
      };
    }
    const importId = created.importId;

    await updateStatementImportStatus(importId, "importing", {
      totalRows: diagnostics.totalRowsExamined,
    });

    // Insert parsed rows — same idempotent dedupe as the API-sync path
    // (select-first on the UNIQUE (bank_connection_id, external_transaction_id)).
    const importSource = IMPORT_SOURCE_BY_FORMAT[format];
    let inserted = 0;
    let duplicates = 0;
    const insertErrors: ImportLineError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const [exists] = await db
          .select({ id: bankTransactions.id })
          .from(bankTransactions)
          .where(
            and(
              eq(bankTransactions.bankConnectionId, conn.id),
              eq(
                bankTransactions.externalTransactionId,
                row.externalTransactionId,
              ),
            ),
          )
          .limit(1);
        if (exists) {
          duplicates++;
          continue;
        }
        await db.insert(bankTransactions).values({
          organizationId,
          bankConnectionId: conn.id,
          externalTransactionId: row.externalTransactionId,
          externalReference: row.externalReference ?? null,
          transactionDate: toDateString(row.transactionDate),
          valueDate: row.valueDate ? toDateString(row.valueDate) : null,
          bookingDate: row.bookingDate ? toDateString(row.bookingDate) : null,
          amountMinor: row.amountMinor,
          currency: row.currency,
          originalAmountMinor: row.originalAmountMinor ?? null,
          originalCurrency: row.originalCurrency ?? null,
          fxRate: row.fxRate != null ? String(row.fxRate) : null,
          description: row.description,
          counterpartyName: row.counterpartyName ?? null,
          counterpartyAccount: row.counterpartyAccount ?? null,
          counterpartyIban: row.counterpartyIban ?? null,
          counterpartySwift: row.counterpartySwift ?? null,
          counterpartyCountry: row.counterpartyCountry ?? null,
          importSource,
          importJobId: importId,
          rawPayload: row.rawPayload as never,
          isPending: row.isPending ?? false,
        });
        inserted++;
      } catch (err) {
        insertErrors.push({
          rowIndex: i,
          reason: `insert failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const allErrors = [...parseErrors, ...insertErrors];
    const failed = allErrors.length;
    const status =
      inserted > 0 || duplicates > 0 ? "completed" : "failed";

    await updateStatementImportStatus(importId, status, {
      transactionsCreated: inserted,
      transactionsSkippedDuplicate: duplicates,
      rowsFailed: failed,
      totalRows: diagnostics.totalRowsExamined,
      statementPeriodStart: diagnostics.periodStart ?? null,
      statementPeriodEnd: diagnostics.periodEnd ?? null,
      errorLog:
        failed > 0
          ? {
              errors: allErrors.slice(0, MAX_LINE_ERRORS_STORED),
              truncated: allErrors.length > MAX_LINE_ERRORS_STORED,
            }
          : undefined,
    });

    // Best-effort auto-match pass so imported lines land pre-matched
    // where the engine is confident. Failure here must not fail the import.
    let autoMatched: number | null = null;
    if (inserted > 0) {
      try {
        const recon = await runAutoReconciliation({ organizationId });
        autoMatched = recon.matched;
      } catch (err) {
        console.error("importStatementAction: auto-reconciliation pass", err);
      }
    }

    await recordAuditEvent({
      actorUserId: me.id,
      action: "banking.statement.import",
      entityType: "statement_import",
      entityId: importId,
      after: {
        importCode: created.importCode,
        format,
        filename: file.name,
        totalRows: diagnostics.totalRowsExamined,
        transactionsCreated: inserted,
        transactionsSkippedDuplicate: duplicates,
        rowsFailed: failed,
      },
    });

    revalidatePath("/development-os/finance/statement-import");
    revalidatePath("/development-os/finance/bank-review");
    revalidatePath("/development-os/finance/reconciliation");
    revalidatePath("/development-os/finance/accounting");

    return {
      ok: true,
      importCode: created.importCode,
      format,
      totalRows: diagnostics.totalRowsExamined,
      imported: inserted,
      skipped: duplicates,
      failed,
      autoMatched,
      lineErrors: allErrors.slice(0, MAX_LINE_ERRORS_RETURNED),
      lineErrorsTruncated: allErrors.length > MAX_LINE_ERRORS_RETURNED,
    };
  } catch (err) {
    console.error("importStatementAction:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Import failed.",
    };
  }
}
