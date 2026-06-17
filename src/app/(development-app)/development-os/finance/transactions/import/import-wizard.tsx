"use client";

/**
 * Transaction import wizard (Paste + Upload).
 *
 * Three-step flow: pick source → parse → review + commit.
 *
 *   Tab A — Paste from Sheets/Excel: TSV/CSV auto-detect.
 *   Tab B — Upload CSV/XLSX file: parsed via `xlsx` browser-side.
 *
 * Auto-mapping uses header heuristics (English + Russian, per the
 * operator's catalog language), with a saved-template picker +
 * editable column-mapping override on the preview panel.
 */

import * as React from "react";
import { useTransition } from "react";
import { ArrowUpRight, Loader2, Upload, ClipboardPaste } from "lucide-react";
import {
  applyMapping,
  autoMapHeaders,
  parsePaste,
  parseXlsx,
  type AppliedRow,
  type ColumnMapping,
  type DestinationField,
  type ParsedSheet,
  DESTINATION_FIELDS,
} from "@/lib/development/server/transaction-import";
import { bulkRecordTransactions } from "@/lib/development/server/transaction-bulk-actions";
import type { BulkRecordResult } from "@/lib/development/server/transaction-bulk-actions";
import {
  listImportTemplates,
  recordImportTemplateUse,
  saveImportTemplate,
  type SavedImportTemplate,
} from "@/lib/development/server/import-template-actions";
import { cn } from "@/lib/utils";

export interface ImportBankAccountOption {
  id: string;
  label: string;
  currency: string;
}

type Tab = "paste" | "upload";

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
      </nav>

      {tab === "paste" && (
        <PasteTab bankAccountId={bankAccountId} />
      )}
      {tab === "upload" && (
        <UploadTab bankAccountId={bankAccountId} />
      )}
    </div>
  );
}

// ============================================================================
// Tab A — Paste
// ============================================================================

function PasteTab({ bankAccountId }: { bankAccountId: string | null }) {
  const [raw, setRaw] = React.useState("");
  const [parsed, setParsed] = React.useState<ParsedSheet | null>(null);

  function handleParse(): void {
    setParsed(parsePaste(raw));
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
          {parsed && (
            <span className="text-xs text-ink-tertiary">
              {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} parsed
              · {parsed.headers.length} header{parsed.headers.length === 1 ? "" : "s"}.
            </span>
          )}
        </div>
      </div>

      {parsed && (
        <ImportPreviewPanel
          parsed={parsed}
          bankAccountId={bankAccountId}
          sourceKind="sheets_paste"
        />
      )}
    </section>
  );
}

// ============================================================================
// Tab B — Upload CSV/XLSX
// ============================================================================

function UploadTab({ bankAccountId }: { bankAccountId: string | null }) {
  const [parsed, setParsed] = React.useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFile(file: File): Promise<void> {
    setError(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      setParsed(await parseXlsx(buf));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setParsed(null);
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

      {parsed && (
        <ImportPreviewPanel
          parsed={parsed}
          bankAccountId={bankAccountId}
          sourceKind="xlsx"
        />
      )}
    </section>
  );
}

// ============================================================================
// Shared review + commit
// ============================================================================

/**
 * Sprint 4.5 — preview panel that owns the editable column-mapping
 * state + template save/load. Derives `applied` from
 * `(parsed, mapping)` so changes re-render the preview live. The
 * <TemplatePicker> + <ColumnMapper> sit above the preview.
 */
function ImportPreviewPanel({
  parsed,
  bankAccountId,
  sourceKind,
}: {
  parsed: ParsedSheet;
  bankAccountId: string | null;
  /** Persisted into saved templates so the picker can scope by kind. */
  sourceKind: "sheets_paste" | "xlsx" | "csv" | "sheets_live";
}) {
  const [mapping, setMapping] = React.useState<ColumnMapping>(() =>
    autoMapHeaders(parsed.headers),
  );
  React.useEffect(() => {
    setMapping(autoMapHeaders(parsed.headers));
  }, [parsed]);

  const applied = React.useMemo(
    () => applyMapping(parsed, mapping),
    [parsed, mapping],
  );

  return (
    <div className="flex flex-col gap-4">
      <TemplatePicker
        sourceKind={sourceKind}
        currentMapping={mapping}
        onApply={(m) => setMapping(m)}
      />
      <ColumnMapper
        headers={parsed.headers}
        mapping={mapping}
        onChange={setMapping}
      />
      <ReviewPreview
        applied={applied}
        headers={parsed.headers}
        bankAccountId={bankAccountId}
      />
    </div>
  );
}

/**
 * Sprint 4.5 — Template picker + save UI. Lists saved templates for
 * the current org (highest version per name) and lets the operator
 * apply one or save the current mapping under a new name.
 */
function TemplatePicker({
  sourceKind,
  currentMapping,
  onApply,
}: {
  sourceKind: "sheets_paste" | "xlsx" | "csv" | "sheets_live";
  currentMapping: ColumnMapping;
  onApply: (mapping: ColumnMapping) => void;
}) {
  const [templates, setTemplates] = React.useState<SavedImportTemplate[]>([]);
  const [picked, setPicked] = React.useState<string>("");
  const [saveName, setSaveName] = React.useState("");
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    listImportTemplates()
      .then((list) => {
        if (!cancelled) setTemplates(list);
      })
      .catch(() => {
        /* listing failures are non-fatal — operator can still save */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleApply(id: string): void {
    setPicked(id);
    setError(null);
    setInfo(null);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    onApply(t.columnMapping);
    setInfo(`Applied template "${t.name}" v${t.version}.`);
    void recordImportTemplateUse({ id }).catch(() => {
      // Audit-only; main apply already succeeded.
    });
  }

  function handleSave(): void {
    setError(null);
    setInfo(null);
    if (!saveName.trim()) {
      setError("Pick a name for the template.");
      return;
    }
    startTransition(async () => {
      try {
        const saved = await saveImportTemplate({
          name: saveName.trim(),
          sourceKind,
          columnMapping: currentMapping,
        });
        setTemplates((prev) => {
          // Replace any existing entry with the same name (since
          // listImportTemplates returns one per name, highest version).
          const others = prev.filter((p) => p.name !== saved.name);
          return [saved, ...others].sort((a, b) => a.name.localeCompare(b.name));
        });
        setPicked(saved.id);
        setSaveName("");
        setInfo(`Saved "${saved.name}" v${saved.version}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <section
      className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3"
      data-stage10="import-template-picker"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-medium text-ink">Mapping template</h3>
          <p className="text-xs text-ink-tertiary leading-relaxed mt-1">
            Apply a saved template, or name the current column-mapping
            to reuse next time. Templates are versioned — saving
            under an existing name auto-bumps the version.
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
          {templates.length} saved
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-tertiary">Apply saved</span>
          <select
            value={picked}
            onChange={(e) => handleApply(e.target.value)}
            disabled={templates.length === 0}
            className="rounded-md border border-line-soft bg-canvas px-2 h-9 text-sm text-ink disabled:opacity-60"
          >
            <option value="">— pick a template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (v{t.version}, {t.useCount} uses)
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-tertiary">Save current as</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g. MyBookkeeperFormat"
              className="flex-1 min-w-0 rounded-md border border-line-soft bg-canvas px-3 h-9 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={pending || saveName.trim() === ""}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 h-9 text-xs font-medium text-ink-inverse hover:bg-ink/90 disabled:opacity-60"
            >
              {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </label>
      </div>

      {(info || error) && (
        <p
          className={
            error
              ? "text-xs text-danger"
              : "text-xs text-success"
          }
          role={error ? "alert" : undefined}
        >
          {error ?? info}
        </p>
      )}
    </section>
  );
}

/**
 * Sprint 4.5 — Column mapping override.
 *
 * Lists every source header with a select picking which destination
 * field it maps to. "(don't map)" leaves the column unused.
 * Re-emits a fresh `ColumnMapping` on every change.
 */
function ColumnMapper({
  headers,
  mapping,
  onChange,
}: {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (next: ColumnMapping) => void;
}) {
  if (headers.length === 0) return null;
  const usedFields = new Set<DestinationField>();
  for (const dest of Object.values(mapping.destination_mapping)) {
    if (dest) usedFields.add(dest);
  }

  function updateHeader(
    header: string,
    next: DestinationField | "",
  ): void {
    const draft: ColumnMapping = {
      ...mapping,
      destination_mapping: { ...mapping.destination_mapping },
    };
    if (next === "") {
      delete draft.destination_mapping[header];
    } else {
      // Drop any other header that's currently claiming `next` — each
      // destination field can be sourced from at most one column.
      for (const h of Object.keys(draft.destination_mapping)) {
        if (h !== header && draft.destination_mapping[h] === next) {
          delete draft.destination_mapping[h];
        }
      }
      draft.destination_mapping[header] = next;
    }
    onChange(draft);
  }

  return (
    <section
      className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3"
      data-stage10="column-mapper"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-medium text-ink">Column mapping</h3>
          <p className="text-xs text-ink-tertiary leading-relaxed mt-1">
            Each source header maps to one destination field (or
            "—" for skip). Auto-mapped via heuristics; tweak below if
            anything's off.
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
          {Object.keys(mapping.destination_mapping).length} /{" "}
          {headers.length} mapped
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {headers.map((h) => {
          const current = mapping.destination_mapping[h];
          return (
            <label
              key={h}
              className="flex flex-col gap-1 text-xs"
              data-mapper-row={h}
            >
              <span className="text-ink-tertiary truncate" title={h}>
                {h}
              </span>
              <select
                value={current ?? ""}
                onChange={(e) =>
                  updateHeader(h, e.target.value as DestinationField | "")
                }
                className="rounded-md border border-line-soft bg-canvas px-2 h-9 text-sm text-ink"
              >
                <option value="">— skip column</option>
                {DESTINATION_FIELDS.map((f) => (
                  <option
                    key={f}
                    value={f}
                    disabled={f !== current && usedFields.has(f)}
                  >
                    {f}
                    {f !== current && usedFields.has(f)
                      ? " (taken)"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </section>
  );
}

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
