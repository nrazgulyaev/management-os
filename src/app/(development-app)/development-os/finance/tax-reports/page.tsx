import type { Metadata } from "next";
import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  listTaxPeriodReports,
  listAllTaxTypes,
} from "@/lib/development/server/tax/tax-actions";
import type { TaxPeriodReport } from "@/lib/db/schema/tax";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";
import { FinalizeReportButton } from "./_finalize-button";
import { MarkFiledButton } from "./_mark-filed-button";
import { FileTaxesButton } from "./_file-taxes-button";
import { RefreshDeclarationsButton } from "./_refresh-button";

export const metadata: Metadata = {
  title: "Taxes ID · Development OS",
};
export const dynamic = "force-dynamic";

/**
 * ID-TAX (0164) — the «Налоги ID» declaration view (mock parity:
 * cc-functional-handoff/cabinets/dev-p1/Accounting.html). Per period:
 * PPN output / input / netto + PPh withheld KPIs, the e-Faktur / e-Bupot
 * declarations table (draft → finalized → filed with DJP reference), the
 * "File taxes" batch action, and the period-close gate note.
 */

interface PeriodKey {
  start: string;
  end: string;
}

function monthLabel(p: PeriodKey): string {
  // Calendar month → "May 2026"; anything else → raw bounds.
  const d = new Date(`${p.start}T00:00:00Z`);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);
  if (p.start.endsWith("-01") && p.end === lastDay) {
    return d.toLocaleString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return `${p.start} → ${p.end}`;
}

function calendarMonth(offset: number): PeriodKey {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0),
  );
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function declarationLabel(
  vatDirection: string | null,
  taxTypeName: string,
): string {
  switch (vatDirection) {
    case "output":
      return "e-Faktur · PPN Keluaran";
    case "input":
      return "e-Faktur · PPN Masukan";
    case "withholding":
      return `e-Bupot · ${taxTypeName}`;
    default:
      return `${taxTypeName} · aggregate`;
  }
}

const STATUS_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "info" | "soft"
> = {
  draft: "warn",
  finalized: "info",
  submitted: "info",
  amended: "warn",
  archived: "soft",
};

function sumTax(rows: TaxPeriodReport[], direction: string): bigint {
  return rows
    .filter((r) => r.vatDirection === direction)
    .reduce((acc, r) => acc + r.totalTaxAmountMinor, 0n);
}

export default async function TaxReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/finance">Finance</Link> / Taxes ID
            </div>
            <h1>Taxes · e-Faktur / e-Bupot.</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }

  const [reports, taxTypes] = await Promise.all([
    safeQuery("listTaxPeriodReports", listTaxPeriodReports(), [], 4000),
    safeQuery("listAllTaxTypes", listAllTaxTypes(), [], 4000),
  ]);
  const taxTypeBy = new Map(taxTypes.map((t) => [t.id, t]));

  // Period candidates: every distinct report period + the current and prior
  // calendar months (so a fresh period can be generated before any cron run).
  const candidates = new Map<string, PeriodKey>();
  for (const p of [calendarMonth(0), calendarMonth(-1)]) {
    candidates.set(`${p.start}_${p.end}`, p);
  }
  for (const r of reports) {
    candidates.set(`${r.periodStart}_${r.periodEnd}`, {
      start: r.periodStart,
      end: r.periodEnd,
    });
  }
  const periods = [...candidates.values()].sort((a, b) =>
    a.start < b.start ? 1 : a.start > b.start ? -1 : 0,
  );

  const priorMonth = calendarMonth(-1);
  const defaultKey =
    reports.length > 0
      ? `${reports[0].periodStart}_${reports[0].periodEnd}`
      : `${priorMonth.start}_${priorMonth.end}`;
  const selectedKey =
    sp.period && candidates.has(sp.period) ? sp.period : defaultKey;
  const selected = candidates.get(selectedKey) ?? priorMonth;

  const inPeriod = reports.filter(
    (r) => r.periodStart === selected.start && r.periodEnd === selected.end,
  );
  const active = inPeriod.filter((r) => r.status !== "archived");

  // KPIs — computed from the direction-aware reports of the period.
  const ppnOutput = sumTax(active, "output");
  const ppnInput = sumTax(active, "input");
  const ppnNetto = ppnOutput - ppnInput;
  const pphWithheld = sumTax(active, "withholding");
  const totalToDjp = ppnNetto + pphWithheld;

  const eligibleCount = active.filter(
    (r) =>
      !r.filedAt && (r.status === "finalized" || r.status === "submitted"),
  ).length;
  const draftBlockers = active.filter(
    (r) =>
      !r.filedAt &&
      r.status !== "finalized" &&
      r.status !== "submitted" &&
      r.totalTaxAmountMinor !== 0n,
  ).length;
  const unfiledNonzero = active.filter(
    (r) => !r.filedAt && r.totalTaxAmountMinor !== 0n,
  ).length;
  const allFiled = active.length > 0 && unfiledNonzero === 0;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> / Taxes ID
          </div>
          <h1>
            Taxes · e-Faktur / e-Bupot.{" "}
            <span className="text-[var(--amber)]">
              Filed before the period closes.
            </span>
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            PPN (VAT) and PPh (withholding) declarations per period, aggregated
            from classified transactions (USD-normalised). Lifecycle: generate
            → finalize → file with DJP. Period close is blocked until every
            declaration with nonzero tax is filed. The monthly
            dev_os_tax_period_report cron refreshes drafts — filed declarations
            are never overwritten.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/finance/period-close"
            className="btn btn-secondary btn-sm"
          >
            Period close →
          </Link>
          <RefreshDeclarationsButton
            periodStart={selected.start}
            periodEnd={selected.end}
          />
          <FileTaxesButton
            periodStart={selected.start}
            periodEnd={selected.end}
            eligibleCount={eligibleCount}
            draftBlockers={draftBlockers}
          />
        </div>
      </div>

      <div className="mb-[18px] flex flex-wrap items-center gap-2">
        <span className="label">Period</span>
        {periods.map((p) => {
          const key = `${p.start}_${p.end}`;
          const isActive = key === selectedKey;
          return (
            <Link
              key={key}
              href={`?period=${key}`}
              className={
                isActive ? "btn btn-amber btn-sm" : "btn btn-secondary btn-sm"
              }
            >
              {monthLabel(p)}
            </Link>
          );
        })}
      </div>

      <div className="cfo-kpis">
        <Kpi
          label="PPN output (on sales)"
          value={formatUsdMinor(ppnOutput)}
          sub="e-Faktur Keluaran · 11% collected"
        />
        <Kpi
          label="PPN input (creditable)"
          value={formatUsdMinor(ppnInput)}
          sub="e-Faktur Masukan · on purchases"
        />
        <Kpi
          label="PPN payable (netto)"
          value={formatUsdMinor(ppnNetto)}
          sub="output − input"
          tone="accent"
        />
        <Kpi
          label="PPh withheld"
          value={formatUsdMinor(pphWithheld)}
          sub="e-Bupot · from contractors"
        />
      </div>

      <Card padding="default" className="mb-[18px]">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">
            Declarations · {monthLabel(selected)}
          </h3>
          <span className="label">
            {active.length} declaration{active.length === 1 ? "" : "s"} ·{" "}
            {allFiled
              ? "all filed — period can close"
              : `${unfiledNonzero} unfiled blocking period close`}
          </span>
        </div>
        {inPeriod.length === 0 ? (
          <EmptyState
            title="No declarations for this period yet"
            description="Use “Refresh declarations” to aggregate this period from classified transactions, or wait for the monthly dev_os_tax_period_report cron (1st of each month)."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Declaration</th>
                <th>Direction</th>
                <th className="num">Taxable (USD)</th>
                <th className="num">Tax (USD)</th>
                <th className="num">Txns</th>
                <th className="num">Unclassified</th>
                <th>Status</th>
                <th>DJP filing</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inPeriod.map((r) => {
                const tt = taxTypeBy.get(r.taxTypeId);
                const name = tt?.displayName ?? r.taxTypeId.slice(0, 8);
                const filed = r.filedAt !== null;
                return (
                  <tr key={r.id}>
                    <td>{declarationLabel(r.vatDirection, name)}</td>
                    <td>
                      <HandoffBadge tone="soft">
                        {r.vatDirection ?? "aggregate"}
                      </HandoffBadge>
                    </td>
                    <td className="num">
                      {formatUsdMinor(r.totalTaxableAmountMinor)}
                    </td>
                    <td className="num">
                      {formatUsdMinor(r.totalTaxAmountMinor)}
                    </td>
                    <td className="num">{r.transactionCount}</td>
                    <td className="num">
                      {r.unclassifiedTransactionCount > 0 ? (
                        <HandoffBadge tone="warn">
                          {r.unclassifiedTransactionCount}
                        </HandoffBadge>
                      ) : (
                        0
                      )}
                    </td>
                    <td>
                      {filed ? (
                        <HandoffBadge tone="ok">filed</HandoffBadge>
                      ) : (
                        <HandoffBadge tone={STATUS_TONE[r.status] ?? "soft"}>
                          {r.status}
                        </HandoffBadge>
                      )}
                    </td>
                    <td className="text-xs">
                      {filed ? (
                        <span className="mono">
                          {r.djpReference ?? "—"}
                          {r.filedAt &&
                            ` · ${new Date(r.filedAt).toISOString().slice(0, 10)}`}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col items-end gap-1">
                        {!filed &&
                          (r.status === "draft" ||
                            r.status === "finalized" ||
                            r.status === "amended") && (
                            <FinalizeReportButton
                              id={r.id}
                              status={r.status}
                              unclassifiedCount={
                                r.unclassifiedTransactionCount
                              }
                            />
                          )}
                        {!filed &&
                          (r.status === "finalized" ||
                            r.status === "submitted") && (
                            <MarkFiledButton id={r.id} />
                          )}
                        {(filed || r.status === "archived") && (
                          <span className="text-xs text-[var(--ink-3)]">
                            —
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="font-semibold" colSpan={3}>
                  Total payable to DJP (PPN netto + PPh)
                </td>
                <td className="num font-semibold">
                  {formatUsdMinor(totalToDjp)}
                </td>
                <td colSpan={4} />
                <td className="text-right">
                  {allFiled ? (
                    <HandoffBadge tone="ok">period can close</HandoffBadge>
                  ) : (
                    <HandoffBadge tone="warn">filing pending</HandoffBadge>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>

      <Card padding="default">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">What exists vs what is next</h3>
          <span className="label">scope note</span>
        </div>
        <p className="cfo-card-sub mt-[10px] mb-0 max-w-[680px]">
          Built: direction-aware PPN output/input + PPh withholding
          declarations, finalize → file lifecycle with DJP reference, audit
          trail, and the period-close gate (a period cannot be closed until
          these declarations are filed). Not built yet — each needs its own
          design pass: Coretax-compatible e-Faktur export files, NPWP
          validation, and per-counterparty bukti potong (e-Bupot)
          certificates. Declarations here track period totals and the DJP
          reference only. Legacy direction-less VAT drafts are archived
          automatically when a period is re-aggregated.
        </p>
      </Card>
    </DevelopmentShell>
  );
}
