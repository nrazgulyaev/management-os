"use client";

/**
 * Sprint MD-1 — Quotation paste-import wizard.
 *
 * Mirrors the Sprint-4 transaction-import wizard's 3-tab shape:
 *   Tab A — Paste TSV/CSV  (textarea → parsePaste → review → commit)
 *   Tab B — Upload XLSX    (file input → parseXlsx → review → commit)
 *   Tab C — Live Sheets    (placeholder; schema/parser already in place)
 *
 * Reuses `parsePaste` + `parseXlsx` from the existing
 * `transaction-import` parser library (those helpers are
 * domain-agnostic — they return ParsedSheet { headers, rows }).
 *
 * Auto-mapping: the wizard reads each row's known header keys
 * (case + space insensitive) and projects to the quotation-line
 * destination shape:
 *   vendor / item / qty / unit / price / lead / note
 * — operators can also paste a positional TSV by checking the
 * "positional" toggle (columns assumed in fixed order).
 *
 * Column-mapper + template-picker (Sprint-4 extras) are intentionally
 * scoped out for this sprint — the auto-mapper covers the common
 * vendor-quote header conventions, and the import_templates table is
 * unchanged so a future polish pass can drop them in.
 */

import * as React from "react";
import { useTransition } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardPaste,
  Link2,
  Loader2,
  Upload,
} from "lucide-react";
import {
  parsePaste,
  parseXlsx,
  type ParsedSheet,
} from "@/lib/development/server/transaction-import";
import {
  bulkInsertQuotationLines,
  type BulkQuotationResult,
} from "@/lib/development/server/procurement/quotation-bulk-actions";
import { cn } from "@/lib/utils";

// ===========================================================================
// Types
// ===========================================================================

export interface QuotationPrOption {
  id: string;
  requestCode: string;
  materialName: string;
  requiredByDate: string;
  status: string;
}

type Tab = "paste" | "upload" | "sheets-live";

type QuotationDestField =
  | "vendor"
  | "item"
  | "quantity"
  | "unit"
  | "price"
  | "lead"
  | "note";

interface MappedRow {
  vendor: string;
  item: string;
  quantity: string;
  unit: string;
  price: string;
  lead: string;
  note: string;
}

// ===========================================================================
// Auto-mapper
// ===========================================================================

const HEADER_HINTS: Record<QuotationDestField, RegExp[]> = {
  vendor: [/vendor/i, /supplier/i, /seller/i, /поставщик/i],
  item: [/item/i, /description/i, /material/i, /наименование/i],
  quantity: [/\bqty\b/i, /quantity/i, /кол-?во/i],
  unit: [/\bunit\b/i, /uom/i, /ед\.?\s*изм/i],
  price: [/price/i, /unit\s*cost/i, /rate/i, /цена/i],
  lead: [/lead/i, /delivery/i, /срок/i],
  note: [/note/i, /comment/i, /remark/i, /примеч/i],
};

function autoMap(headers: string[]): Partial<Record<QuotationDestField, string>> {
  const out: Partial<Record<QuotationDestField, string>> = {};
  for (const field of Object.keys(HEADER_HINTS) as QuotationDestField[]) {
    const patterns = HEADER_HINTS[field];
    const match = headers.find((h) => patterns.some((p) => p.test(h)));
    if (match) out[field] = match;
  }
  return out;
}

function applyMapping(
  sheet: ParsedSheet,
  mapping: Partial<Record<QuotationDestField, string>>,
): MappedRow[] {
  return sheet.rows.map((r) => ({
    vendor: mapping.vendor ? (r[mapping.vendor] ?? "").trim() : "",
    item: mapping.item ? (r[mapping.item] ?? "").trim() : "",
    quantity: mapping.quantity ? (r[mapping.quantity] ?? "").trim() : "",
    unit: mapping.unit ? (r[mapping.unit] ?? "").trim() : "",
    price: mapping.price ? (r[mapping.price] ?? "").trim() : "",
    lead: mapping.lead ? (r[mapping.lead] ?? "").trim() : "",
    note: mapping.note ? (r[mapping.note] ?? "").trim() : "",
  }));
}

// ===========================================================================
// Wizard
// ===========================================================================

export function QuotationImportWizard({
  prs,
  vendorNames,
}: {
  prs: QuotationPrOption[];
  vendorNames: string[];
}) {
  const [tab, setTab] = React.useState<Tab>("paste");
  const [prId, setPrId] = React.useState<string | null>(prs[0]?.id ?? null);
  const [currency, setCurrency] = React.useState<string>("IDR");

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-secondary font-medium">Target PR</span>
          <select
            className="rounded-md border border-line-soft bg-canvas px-3 h-9 text-sm text-ink min-w-[260px]"
            value={prId ?? ""}
            onChange={(e) => setPrId(e.target.value || null)}
          >
            <option value="" disabled>
              Pick a purchase request…
            </option>
            {prs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.requestCode} · {p.materialName} · req {p.requiredByDate}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-secondary font-medium">Currency</span>
          <select
            className="rounded-md border border-line-soft bg-canvas px-3 h-9 text-sm text-ink"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {["IDR", "USD", "EUR", "USDT"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-ink-tertiary w-full">
          All imported rows attach to this PR. Each unique vendor in the
          import creates (or appends to) one
          <code className="font-mono"> procurement_quotations </code>
          row.
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
          Upload XLSX
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
        <PasteTab
          prId={prId}
          currency={currency}
          vendorNames={vendorNames}
        />
      )}
      {tab === "upload" && (
        <UploadTab
          prId={prId}
          currency={currency}
          vendorNames={vendorNames}
        />
      )}
      {tab === "sheets-live" && <SheetsLivePlaceholder />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 h-8 text-xs font-medium rounded-full transition-colors",
        active
          ? "bg-ink text-ink-inverse"
          : "text-ink-secondary hover:bg-muted/60",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ===========================================================================
// Tab A — Paste
// ===========================================================================

function PasteTab({
  prId,
  currency,
  vendorNames,
}: {
  prId: string | null;
  currency: string;
  vendorNames: string[];
}) {
  const [raw, setRaw] = React.useState("");
  const [parsed, setParsed] = React.useState<ParsedSheet | null>(null);

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
        <h3 className="text-sm font-medium text-ink">
          Paste vendor quote rows
        </h3>
        <p className="text-xs text-ink-tertiary leading-relaxed">
          Include the header row. Headers like{" "}
          <code className="font-mono">Vendor / Item / Qty / Unit / Price / Lead</code>{" "}
          auto-detect. Tabs and commas both work.
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={10}
          className="w-full rounded-md border border-line-soft bg-canvas px-3 py-2 text-xs font-mono text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong"
          placeholder="Vendor	Item	Qty	Unit	Price	Lead	Note&#10;PT Sumber	Cement OPC 50kg	100	bag	78500	7	Includes delivery&#10;PT Mitra	Cement OPC 50kg	100	bag	81000	5	Direct ex-factory"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setParsed(parsePaste(raw))}
            disabled={raw.trim() === ""}
            className="inline-flex items-center justify-center rounded-full bg-ink px-4 h-9 text-sm font-medium text-ink-inverse hover:bg-ink/90 disabled:opacity-60"
          >
            Parse + preview
          </button>
          {parsed && (
            <span className="text-xs text-ink-tertiary">
              {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}{" "}
              parsed · {parsed.headers.length} header
              {parsed.headers.length === 1 ? "" : "s"}.
            </span>
          )}
        </div>
      </div>

      {parsed && (
        <PreviewPanel
          parsed={parsed}
          prId={prId}
          currency={currency}
          vendorNames={vendorNames}
        />
      )}
    </section>
  );
}

// ===========================================================================
// Tab B — Upload
// ===========================================================================

function UploadTab({
  prId,
  currency,
  vendorNames,
}: {
  prId: string | null;
  currency: string;
  vendorNames: string[];
}) {
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
          First sheet is read; first row is the header. Auto-detected
          columns: Vendor, Item, Qty, Unit, Price, Lead, Note (case
          insensitive, EN + RU header conventions).
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
        <PreviewPanel
          parsed={parsed}
          prId={prId}
          currency={currency}
          vendorNames={vendorNames}
        />
      )}
    </section>
  );
}

// ===========================================================================
// Tab C — Live Sheets placeholder
// ===========================================================================

function SheetsLivePlaceholder() {
  return (
    <section className="rounded-3xl border border-line-soft bg-gradient-gold-soft shadow-soft-card p-6 md:p-8 flex flex-col gap-3">
      <h3 className="text-display text-[22px] md:text-[26px] leading-tight font-medium text-ink">
        Live Google Sheets sync — coming after Sprint 4.5
      </h3>
      <p className="text-sm text-ink-secondary leading-relaxed max-w-2xl">
        The existing
        <code className="font-mono"> src/lib/google-workspace/sheets/ </code>
        library already supports live Sheets reads; the
        <code className="font-mono"> import_templates </code>
        table already has a <code className="font-mono">sheets_live</code>
        sourceKind. Wiring the OAuth + spreadsheet picker into this tab
        is a follow-up.
      </p>
      <p className="text-sm text-ink-secondary leading-relaxed">
        For now, use <strong className="font-medium">Paste</strong> or{" "}
        <strong className="font-medium">Upload XLSX</strong> above.
      </p>
    </section>
  );
}

// ===========================================================================
// Shared review + commit
// ===========================================================================

function PreviewPanel({
  parsed,
  prId,
  currency,
  vendorNames,
}: {
  parsed: ParsedSheet;
  prId: string | null;
  currency: string;
  vendorNames: string[];
}) {
  const mapping = React.useMemo(() => autoMap(parsed.headers), [parsed]);
  const mapped = React.useMemo(
    () => applyMapping(parsed, mapping),
    [parsed, mapping],
  );
  const [result, setResult] = React.useState<BulkQuotationResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const populated = mapped.filter(
    (r) => r.vendor && r.item && r.quantity && r.unit && r.price,
  );

  const unmappedFields = (
    [
      "vendor",
      "item",
      "quantity",
      "unit",
      "price",
    ] as QuotationDestField[]
  ).filter((f) => !mapping[f]);

  function handleCommit(): void {
    setError(null);
    setResult(null);
    if (!prId) {
      setError("Pick a purchase request first.");
      return;
    }
    if (populated.length === 0) {
      setError(
        "No fully-populated rows. Each row needs Vendor + Item + Qty + Unit + Price.",
      );
      return;
    }
    startTransition(async () => {
      try {
        const out = await bulkInsertQuotationLines({
          prId,
          currency,
          quotationLines: populated.map((r) => ({
            vendorName: r.vendor,
            itemDescription: r.item,
            quantity: r.quantity,
            unitOfMeasure: r.unit,
            unitPriceMajor: r.price,
            leadTimeDays: r.lead || null,
            note: r.note || null,
          })),
        });
        setResult(out);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
        <h3 className="text-sm font-medium text-ink">Auto-detected mapping</h3>
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-ink-secondary">
          {(
            [
              "vendor",
              "item",
              "quantity",
              "unit",
              "price",
              "lead",
              "note",
            ] as QuotationDestField[]
          ).map((field) => (
            <li
              key={field}
              className="flex flex-col gap-0.5 rounded-md border border-line-soft bg-canvas px-3 py-2"
            >
              <span className="text-[10px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                {field}
              </span>
              <span className="font-mono truncate">
                {mapping[field] ?? "—"}
              </span>
            </li>
          ))}
        </ul>
        {unmappedFields.length > 0 && (
          <p className="text-xs text-warning">
            Missing column mappings: {unmappedFields.join(", ")}. Add a
            matching header (or rename the column) in the source sheet
            and re-paste.
          </p>
        )}
      </div>

      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-medium text-ink">
            Preview ({populated.length} of {mapped.length} rows complete)
          </h3>
          <button
            type="button"
            onClick={handleCommit}
            disabled={pending || populated.length === 0 || !prId}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 h-9 text-sm font-medium text-ink-inverse hover:bg-ink/90 disabled:opacity-60"
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Commit {populated.length} row{populated.length === 1 ? "" : "s"}
          </button>
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs border-collapse min-w-[820px]">
            <thead className="bg-muted text-ink-tertiary text-[10px] uppercase tracking-[0.12em]">
              <tr>
                <th className="text-left px-2 py-2">#</th>
                <th className="text-left px-2 py-2">Vendor</th>
                <th className="text-left px-2 py-2">Item</th>
                <th className="text-right px-2 py-2">Qty</th>
                <th className="text-left px-2 py-2">Unit</th>
                <th className="text-right px-2 py-2">Price</th>
                <th className="text-right px-2 py-2">Lead</th>
                <th className="text-left px-2 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {mapped.slice(0, 30).map((r, i) => {
                const complete =
                  r.vendor && r.item && r.quantity && r.unit && r.price;
                const vendorMatch =
                  r.vendor &&
                  vendorNames.some(
                    (v) =>
                      v.trim().toLowerCase() === r.vendor.trim().toLowerCase(),
                  );
                return (
                  <tr
                    key={i}
                    className={cn(
                      "border-t border-line-soft",
                      !complete && "opacity-60",
                    )}
                  >
                    <td className="px-2 py-1 text-ink-tertiary font-mono tabular-nums">
                      {i + 1}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1",
                        r.vendor && !vendorMatch && "text-warning",
                      )}
                    >
                      {r.vendor || "—"}
                    </td>
                    <td className="px-2 py-1">{r.item || "—"}</td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {r.quantity || "—"}
                    </td>
                    <td className="px-2 py-1">{r.unit || "—"}</td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {r.price || "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {r.lead || "—"}
                    </td>
                    <td className="px-2 py-1 text-ink-tertiary">
                      {r.note || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {mapped.length > 30 && (
            <p className="text-[11px] text-ink-tertiary mt-2 px-2">
              Showing first 30 of {mapped.length} rows. All complete rows
              will be committed.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {result && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-ink">
              <strong className="font-medium">{result.successCount}</strong> of{" "}
              {result.totalRows} rows saved across{" "}
              <strong className="font-medium">{result.quotationsCreatedCount}</strong>{" "}
              new quotation
              {result.quotationsCreatedCount === 1 ? "" : "s"}.
              {result.errorCount > 0 && (
                <>
                  {" "}
                  <span className="text-danger">
                    {result.errorCount} need attention.
                  </span>
                </>
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
            {result.successCount > 0 && (
              <Link
                href="/development-os/procurement/quotation-comparison"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline self-start"
              >
                Open quotation comparison
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
