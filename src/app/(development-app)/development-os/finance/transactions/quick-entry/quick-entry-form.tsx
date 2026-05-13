/**
 * Sprint 4 — Quick-entry client island.
 *
 * Mounts <SpreadsheetView> with the 9 columns operators want for
 * daily bookkeeping. Bank account is picked once via a select above
 * the grid (per Sprint 4 scope decision — every row in one session
 * lands on the same account). The grid's onCommit invokes the bulk
 * server action and surfaces per-row results inline.
 */

"use client";

import * as React from "react";
import { useTransition } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import {
  SpreadsheetView,
  type CellValue,
  type SpreadsheetColumn,
} from "@/components/ui/primitives/spreadsheet-view";
import { bulkRecordTransactions } from "@/lib/development/server/transaction-bulk-actions";
import type { BulkRecordResult } from "@/lib/development/server/transaction-bulk-actions";

const CURRENCY_OPTIONS = ["USD", "EUR", "IDR", "USDT"] as const;
const DIRECTION_OPTIONS = ["inflow", "outflow"] as const;

interface QuickEntryRow extends Record<string, CellValue> {
  date: string | null;
  direction: string | null;
  amountMajor: string | null;
  currency: string | null;
  categoryName: string | null;
  projectCode: string | null;
  counterpartyName: string | null;
  description: string | null;
  notes: string | null;
}

export interface BankAccountOption {
  id: string;
  label: string;
  currency: string;
}

export interface QuickEntryCatalog {
  categories: string[];
  projects: string[];
}

export function QuickEntryForm({
  bankAccounts,
  catalog,
}: {
  bankAccounts: BankAccountOption[];
  catalog: QuickEntryCatalog;
}) {
  const [bankAccountId, setBankAccountId] = React.useState<string | null>(
    bankAccounts[0]?.id ?? null,
  );
  const [result, setResult] = React.useState<BulkRecordResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const columns = React.useMemo<SpreadsheetColumn<QuickEntryRow>[]>(
    () => [
      {
        key: "date",
        label: "Date",
        type: "date",
        width: 130,
        validate: (v) =>
          v && /^\d{4}-\d{2}-\d{2}$/.test(String(v))
            ? null
            : v
              ? "YYYY-MM-DD"
              : null,
      },
      {
        key: "direction",
        label: "Type",
        type: "text",
        width: 90,
        validate: (v) =>
          !v ||
          DIRECTION_OPTIONS.includes(
            String(v).toLowerCase() as (typeof DIRECTION_OPTIONS)[number],
          )
            ? null
            : "inflow or outflow",
        suggestions: () => [...DIRECTION_OPTIONS],
      },
      {
        key: "amountMajor",
        label: "Amount",
        type: "number",
        width: 110,
        align: "right",
        validate: (v) =>
          !v
            ? null
            : Number.isFinite(Number(v)) && Number(v) > 0
              ? null
              : "Positive number",
      },
      {
        key: "currency",
        label: "Currency",
        type: "text",
        width: 90,
        validate: (v) =>
          !v ||
          CURRENCY_OPTIONS.includes(
            String(v).toUpperCase() as (typeof CURRENCY_OPTIONS)[number],
          )
            ? null
            : `One of ${CURRENCY_OPTIONS.join(", ")}`,
        suggestions: () => [...CURRENCY_OPTIONS],
      },
      {
        key: "categoryName",
        label: "Category",
        type: "text",
        width: 180,
        suggestions: () => catalog.categories,
      },
      {
        key: "projectCode",
        label: "Project",
        type: "text",
        width: 140,
        suggestions: () => catalog.projects,
      },
      {
        key: "counterpartyName",
        label: "Vendor",
        type: "text",
        width: 160,
      },
      {
        key: "description",
        label: "Description",
        type: "text",
        width: 240,
        validate: (v) =>
          v && String(v).trim().length > 0 ? null : "Required",
      },
      {
        key: "notes",
        label: "Notes",
        type: "text",
        width: 200,
      },
    ],
    [catalog],
  );

  const handleCommit = (rows: QuickEntryRow[]): void => {
    setError(null);
    setResult(null);
    if (!bankAccountId) {
      setError("Pick a bank account first.");
      return;
    }
    const populated = rows.filter(
      (r) =>
        r.date && r.direction && r.amountMajor && r.currency && r.description,
    );
    if (populated.length === 0) {
      setError(
        "Fill in at least one row's required fields (date, type, amount, currency, description).",
      );
      return;
    }
    startTransition(async () => {
      try {
        const apiRows = populated.map((r) => {
          const amountMajor = Number(r.amountMajor);
          const isUsdt = String(r.currency).toUpperCase() === "USDT";
          // USDT uses 6dp minor units (per recordTransaction).
          // Other currencies use 2dp (standard cents).
          const minorMultiplier = isUsdt ? 1_000_000 : 100;
          return {
            date: String(r.date),
            direction: String(r.direction).toLowerCase() as
              | "inflow"
              | "outflow",
            amountMinor: Math.round(amountMajor * minorMultiplier),
            currency: String(r.currency).toUpperCase() as
              | (typeof CURRENCY_OPTIONS)[number],
            fxRate: "1",
            categoryName: r.categoryName ? String(r.categoryName) : null,
            projectCode: r.projectCode ? String(r.projectCode) : null,
            counterpartyName: r.counterpartyName
              ? String(r.counterpartyName)
              : null,
            description: String(r.description),
            notes: r.notes ? String(r.notes) : null,
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
  };

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
          Tab/Enter to move between cells. Paste TSV/CSV from Sheets or
          Excel. Ctrl/Cmd-S saves all valid rows.
        </p>
      </header>

      <SpreadsheetView
        columns={columns}
        rows={[]}
        emptyRows={12}
        onCommit={handleCommit}
        caption="Use the cells below to enter transactions. Press Save (Ctrl/Cmd-S) when ready."
      />

      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
        {pending && (
          <p className="inline-flex items-center gap-2 text-sm text-ink-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {result && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-ink">
              <strong className="font-medium">{result.successCount}</strong> of{" "}
              {result.totalRows} rows saved.
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
              <a
                href="/development-os/finance/transactions"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline self-start"
              >
                Open transactions list
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
