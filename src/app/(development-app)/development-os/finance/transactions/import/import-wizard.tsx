"use client";

/**
 * Sprint 4 — Transaction import wizard (Tabs A + B; Tab C is a 4.5
 * placeholder).
 *
 * Three-step flow: pick source → parse → review + commit.
 *
 *   Tab A — Paste from Sheets/Excel: TSV/CSV auto-detect.
 *   Tab B — Upload CSV/XLSX file: parsed via `xlsx` browser-side.
 *   Tab C — Google Sheets live: deferred placeholder for Sprint 4.5.
 *
 * Auto-mapping uses header heuristics (English + Russian, per the
 * operator's catalog language). Override-UI + template-save deferred
 * to Sprint 4.5 — Sprint 4 ships the parse-preview-commit path with
 * the migrations + schema in place so 4.5 is purely UI work.
 */

import * as React from "react";
import { useTransition } from "react";
import { ArrowUpRight, Loader2, Upload, ClipboardPaste, Link2 } from "lucide-react";
import {
  applyMapping,
  autoMapHeaders,
  parsePaste,
  parseXlsx,
  type AppliedRow,
  type DestinationField,
  DESTINATION_FIELDS,
} from "@/lib/development/server/transaction-import";
import { bulkRecordTransactions } from "@/lib/development/server/transaction-bulk-actions";
import type { BulkRecordResult } from "@/lib/development/server/transaction-bulk-actions";
import { cn } from "@/lib/utils";

export interface ImportBankAccountOption {
  id: string;
  label: string;
  currency: string;
}

type Tab = "paste" | "upload" | "sheets-live";

export function ImportWizard({
  bankAccounts,
}: {
  bankAccounts: ImportBankAccountOption[];
}) {
  const [tab, setTab] = React.useState<Tab>("paste");
  const [bankAccountId, setBankAccountId] = React.useState<string | null>(
    bankAccounts[0]?.id ?? null,
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-secondary font-medium">Bank account</span>
          <select
            className="rounded-md border border-line-soft bg-canvas px-3 h-9 text-sm text-ink"
            value={bankAccountId ?? ""}
            onChange={(e) => setBankAccountId(e.target.value || null)}
          >
            <option value="" disabled>
              Pick an account…
            </option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} · {b.currency}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-ink-tertiary">
          All imported rows land on this account. To switch accounts
          mid-import, do separate import sessions.
        </p>
      </header>

      <nav
        className="inline-flex items-center rounded-full bg-surface border border-line-soft p-1 shadow-soft-card self-start"
        role="tablist"
      >
        <TabButton
          active={tab === "paste"}
          onClick={() => setTab("paste")}
          icon={<ClipboardPaste className="w-3.5 h-3.5" strokeWidth={1.75} />}
        >
          Paste
        </TabButton>
        <TabButton
          active={tab === "upload"}
          onClick={() => setTab("upload")}
          icon={<Upload className="w-3.5 h-3.5" strokeWidth={1.75} />}
        >
          Upload CSV/XLSX
        </TabButton>
        <TabButton
          active={tab === "sheets-live"}
          onClick={() => setTab("sheets-live")}
          icon={<Link2 className="w-3.5 h-3.5" strokeWidth={1.75} />}
        >
          Google Sheets (live)
        </TabButton>
      </nav>

      {tab === "paste" && (
        <PasteTab bankAccountId={bankAccountId} />
      )}
      {tab === "upload" && (
        <UploadTab bankAccountId={bankAccountId} />
      )}
      {tab === "sheets-live" && <SheetsLivePlaceholder />}
    </div>
  );
}

// ============================================================================
// Tab A — Paste
// ============================================================================

function PasteTab({ bankAccountId }: { bankAccountId: string | null }) {
  const [raw, setRaw] = React.useState("");
  const [applied, setApplied] = React.useState<AppliedRow[] | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);

  function handleParse(): void {
    const parsed = parsePaste(raw);
    setHeaders(parsed.headers);
    const mapping = autoMapHeaders(parsed.headers);
    setApplied(applyMapping(parsed, mapping));
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
        <h3 className="text-sm font-medium text-ink">
          Paste rows from Google Sheets or Excel
        </h3>
        <p className="text-xs text-ink-tertiary leading-relaxed">
          Select the rows in your spreadsheet (include the header row)
          → Cmd/Ctrl-C → paste below. Tabs (Sheets default) and commas
          (CSV) are both auto-detected.
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={10}
          className="w-full rounded-md border border-line-soft bg-canvas px-3 py-2 text-xs font-mono text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong"
          placeholder="Date	Type	USD	Category	Description&#10;2026-04-12	Expense	1250	Construction	Cement delivery&#10;…"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleParse}
            disabled={raw.trim() === ""}
            className="inline-flex items-center justify-center rounded-full bg-ink px-4 h-9 text-sm font-medium text-ink-inverse hover:bg-ink/90 disabled:opacity-60"
          >
            Parse + preview
          </button>
          {applied && (
            <span className="text-xs text-ink-tertiary">
              {applied.length} row{applied.length === 1 ? "" : "s"} parsed.
              Auto-mapped {Object.keys(headers.length ? headers : []).length} header
              {headers.length === 1 ? "" : "s"}.
            </span>
          )}
        </div>
      </div>

      {applied && (
        <ReviewPreview
          applied={applied}
          headers={headers}
          bankAccountId={bankAccountId}
        />
      )}
    </section>
  );
}

// ============================================================================
// Tab B — Upload CSV/XLSX
// ============================================================================

function UploadTab({ bankAccountId }: { bankAccountId: string | null }) {
  const [applied, setApplied] = React.useState<AppliedRow[] | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFile(file: File): Promise<void> {
    setError(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseXlsx(buf);
      setHeaders(parsed.headers);
      const mapping = autoMapHeaders(parsed.headers);
      setApplied(applyMapping(parsed, mapping));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setApplied(null);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-3xl border border-dashed border-line-soft bg-surface shadow-soft-card p-8 md:p-10 flex flex-col items-center gap-3 text-center">
        <Upload className="w-8 h-8 text-ink-tertiary" strokeWidth={1.5} />
        <p className="text-sm font-medium text-ink">
          Drop a CSV, XLSX, XLS, or ODS file
        </p>
        <p className="text-xs text-ink-tertiary max-w-md leading-relaxed">
          The first sheet is read; the first row is treated as the
          header. Auto-mapping covers English + Russian column names
          (date, дата, amount, сумма, etc.).
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.ods"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
          className="text-xs text-ink-secondary mt-2"
        />
        {fileName && (
          <p className="text-xs text-ink-tertiary mt-2">
            Loaded: <span className="font-mono">{fileName}</span>
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger mt-1">
            {error}
          </p>
        )}
      </div>

      {applied && (
        <ReviewPreview
          applied={applied}
          headers={headers}
          bankAccountId={bankAccountId}
        />
      )}
    </section>
  );
}

// ============================================================================
// Tab C — Sprint 4.5 placeholder
// ============================================================================

function SheetsLivePlaceholder() {
  return (
    <section className="rounded-3xl border border-line-soft bg-gradient-gold-soft shadow-soft-card p-6 md:p-8 flex flex-col gap-3">
      <h3 className="text-display text-[22px] md:text-[26px] leading-tight font-medium text-ink">
        Live Google Sheets sync — Sprint 4.5
      </h3>
      <p className="text-sm text-ink-secondary leading-relaxed max-w-2xl">
        Sprint 4 ships the migrations + schema + parser library for
        live Sheets sync (see <code>drizzle/0097_import_templates.sql</code>
        and <code>src/lib/google-workspace/sheets/</code>). The UI to
        authorize a Google account, pick a spreadsheet, and one-shot
        import live rows lands in Sprint 4.5.
      </p>
      <p className="text-sm text-ink-secondary leading-relaxed">
        For now, use{" "}
        <strong className="font-medium">Paste</strong> or{" "}
        <strong className="font-medium">Upload CSV/XLSX</strong> above.
      </p>
    </section>
  );
}

// ============================================================================
// Shared review + commit
// ============================================================================

function ReviewPreview({
  applied,
  headers,
  bankAccountId,
}: {
  applied: AppliedRow[];
  headers: string[];
  bankAccountId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = React.useState<BulkRecordResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function handleImport(): void {
    setError(null);
    setResult(null);
    if (!bankAccountId) {
      setError("Pick a bank account at the top of the page.");
      return;
    }
    const usable = applied.filter(
      (a) => Object.keys(a.row).length > 0 && a.row.description,
    );
    if (usable.length === 0) {
      setError(
        "No usable rows — every row needs at least a description field. Check the mapping.",
      );
      return;
    }
    startTransition(async () => {
      try {
        const apiRows = usable.map((a) => {
          const amountMajor = Number(a.row.amountMajor ?? 0);
          const currency = (a.row.currency ?? "USD").toUpperCase();
          const isUsdt = currency === "USDT";
          const minorMultiplier = isUsdt ? 1_000_000 : 100;
          return {
            date: String(a.row.date ?? ""),
            direction: (String(a.row.direction ?? "outflow").toLowerCase() ===
            "inflow"
              ? "inflow"
              : "outflow") as "inflow" | "outflow",
            amountMinor: Math.round(amountMajor * minorMultiplier),
            currency: currency as "USD" | "EUR" | "IDR" | "USDT",
            fxRate: "1",
            categoryName: a.row.categoryName ?? null,
            projectCode: a.row.projectCode ?? null,
            counterpartyName: a.row.counterpartyName ?? null,
            description: a.row.description ?? "",
            notes: a.row.notes ?? null,
          };
        });
        const out = await bulkRecordTransactions({
          bankAccountId,
          rows: apiRows,
        });
        setResult(out);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const warningCount = applied.reduce((n, a) => n + a.warnings.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-sm font-medium text-ink">
            {applied.length} row{applied.length === 1 ? "" : "s"} ready to
            review
          </h3>
          <p className="text-xs text-ink-tertiary mt-1">
            Auto-mapped headers: {headers.join(", ") || "—"}
            {warningCount > 0 && (
              <>
                {" "}
                · <span className="text-warning">{warningCount} warning{warningCount === 1 ? "" : "s"}</span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleImport}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 h-10 text-sm font-medium text-ink-inverse hover:bg-ink/90 disabled:opacity-60"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending ? "Importing…" : `Import ${applied.length} rows`}
          <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-canvas border-b border-line-soft">
            <tr>
              <th className="text-left font-medium text-ink-tertiary px-3 py-2 w-10">#</th>
              {DESTINATION_FIELDS.map((f) => (
                <th
                  key={f}
                  className="text-left font-medium text-ink-tertiary px-3 py-2"
                >
                  {f}
                </th>
              ))}
              <th className="text-left font-medium text-ink-tertiary px-3 py-2">
                Warnings
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {applied.slice(0, 50).map((a) => (
              <tr key={a.sourceIndex}>
                <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                  {a.sourceIndex + 1}
                </td>
                {DESTINATION_FIELDS.map((f) => (
                  <td
                    key={f}
                    className={cn(
                      "px-3 py-2 text-ink whitespace-nowrap",
                      !a.row[f as DestinationField] &&
                        "text-ink-tertiary opacity-60",
                    )}
                  >
                    {a.row[f as DestinationField] ?? "—"}
                  </td>
                ))}
                <td className="px-3 py-2 text-warning">
                  {a.warnings.length > 0 ? a.warnings.join("; ") : ""}
                </td>
              </tr>
            ))}
            {applied.length > 50 && (
              <tr>
                <td
                  colSpan={DESTINATION_FIELDS.length + 2}
                  className="px-3 py-3 text-center text-xs text-ink-tertiary"
                >
                  … {applied.length - 50} more rows (full import will include them)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {result && (
        <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-2 text-sm">
          <p className="text-ink">
            <strong className="font-medium">{result.successCount}</strong> of{" "}
            {result.totalRows} rows imported.
            {result.errorCount > 0 && (
              <span className="text-danger">
                {" "}
                {result.errorCount} need attention.
              </span>
            )}
          </p>
          {result.errorCount > 0 && (
            <ul className="text-xs text-ink-secondary flex flex-col gap-0.5 max-h-32 overflow-y-auto border border-line-soft rounded-md px-3 py-2 bg-canvas">
              {result.results
                .filter((r) => !r.ok)
                .map((r) => (
                  <li key={r.rowIndex} className="font-mono tabular-nums">
                    Row {r.rowIndex + 1}: {r.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab button — internal
// ============================================================================

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 h-8 text-xs md:text-sm font-medium transition-colors",
        active
          ? "bg-ink text-ink-inverse"
          : "text-ink-secondary hover:text-ink",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
