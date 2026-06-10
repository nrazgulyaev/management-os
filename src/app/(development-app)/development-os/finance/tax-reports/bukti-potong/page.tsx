import type { Metadata } from "next";
import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  loadWithholdingRegister,
  loadWithholdingCounterpartyDetail,
  type WithholdingRegisterData,
  type WithholdingCounterpartyDetail,
} from "@/lib/development/server/tax/withholding-register";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";
import {
  calendarMonth,
  monthLabel,
  parsePeriodParam,
  periodParam,
  type PeriodKey,
} from "../_period";
import { PrintButton } from "./_print-button";

export const metadata: Metadata = {
  title: "Bukti potong register · Development OS",
};
export const dynamic = "force-dynamic";

/**
 * ID-TAX compliance trio — bukti potong SOURCE register (read-only).
 *
 * Per period: PPh withholding grouped by counterparty (gross base /
 * withheld / transaction count) from the PPh-classified dev_transactions
 * — the same rows the e-Bupot declaration aggregates. Each counterparty
 * opens a printable per-counterparty detail DRAFT. Official e-Bupot
 * certificate numbers are issued by DJP/Coretax; none are invented here.
 */

const DRAFT_NOTE =
  "Bukti potong draft — official e-Bupot numbers are issued by DJP/Coretax, this is the source register";

const NO_COUNTERPARTY_LABEL = "(no counterparty recorded)";

function emptyRegister(period: PeriodKey): WithholdingRegisterData {
  return {
    organizationId: "",
    periodStart: period.start,
    periodEnd: period.end,
    pphTaxTypeNames: [],
    rows: [],
    totalGrossBaseUsdMinor: 0n,
    totalWithheldUsdMinor: 0n,
  };
}

export default async function BuktiPotongPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; counterparty?: string }>;
}) {
  const sp = await searchParams;

  const crumb = (
    <div className="crumb">
      <Link href="/development-os">Development OS</Link> /{" "}
      <Link href="/development-os/finance">Finance</Link> /{" "}
      <Link href="/development-os/finance/tax-reports">Taxes ID</Link> / Bukti
      potong
    </div>
  );

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            {crumb}
            <h1>Bukti potong · PPh withholding register.</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }

  // Period candidates: current + prior calendar month + whatever the parent
  // page linked in (arbitrary report periods stay addressable).
  const candidates = new Map<string, PeriodKey>();
  for (const p of [calendarMonth(0), calendarMonth(-1)]) {
    candidates.set(periodParam(p), p);
  }
  const fromParam = parsePeriodParam(sp.period);
  if (fromParam) candidates.set(periodParam(fromParam), fromParam);
  const selected = fromParam ?? calendarMonth(-1);
  const selectedKey = periodParam(selected);

  // `counterparty` present (even "") → printable per-counterparty detail.
  if (sp.counterparty !== undefined) {
    const detail = await safeQuery(
      "loadWithholdingCounterpartyDetail",
      loadWithholdingCounterpartyDetail(
        selected.start,
        selected.end,
        sp.counterparty,
      ),
      {
        counterpartyName: sp.counterparty.trim(),
        periodStart: selected.start,
        periodEnd: selected.end,
        lines: [],
        totalGrossBaseUsdMinor: 0n,
        totalWithheldUsdMinor: 0n,
      } satisfies WithholdingCounterpartyDetail,
      4000,
    );
    const displayName = detail.counterpartyName || NO_COUNTERPARTY_LABEL;
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            {crumb}
            <h1>Bukti potong draft · {displayName}</h1>
            <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
              {DRAFT_NOTE}.
            </p>
          </div>
          <div className="actions">
            <Link
              href={`/development-os/finance/tax-reports/bukti-potong?period=${selectedKey}`}
              className="btn btn-secondary btn-sm"
            >
              ← Register
            </Link>
            <PrintButton />
          </div>
        </div>

        <Card padding="default">
          <div className="cfo-card-head">
            <h3 className="cfo-card-title">
              PPh withheld · {displayName} · {monthLabel(selected)}
            </h3>
            <HandoffBadge tone="warn">draft — no e-Bupot number</HandoffBadge>
          </div>
          <p className="cfo-card-sub mt-[10px] max-w-[680px]">
            Source transactions (USD-normalised) this counterparty's bukti
            potong would certify for {selected.start} → {selected.end}. Tax
            types: {detail.lines.length > 0
              ? [...new Set(detail.lines.map((l) => l.taxTypeName))]
                  .filter(Boolean)
                  .join(", ") || "—"
              : "—"}
            .
          </p>
          {detail.lines.length === 0 ? (
            <EmptyState
              title="No PPh-classified transactions"
              description="Nothing was withheld for this counterparty in the selected period (or the period has not been classified yet)."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transaction</th>
                  <th>Description</th>
                  <th>Tax type</th>
                  <th>Direction</th>
                  <th className="num">Gross base (USD)</th>
                  <th className="num">Withheld (USD)</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((l) => (
                  <tr key={l.transactionCode}>
                    <td>{l.transactionDate}</td>
                    <td className="mono">{l.transactionCode}</td>
                    <td>{l.description}</td>
                    <td>{l.taxTypeName || "—"}</td>
                    <td>
                      <HandoffBadge tone="soft">{l.direction}</HandoffBadge>
                    </td>
                    <td className="num">
                      {formatUsdMinor(l.grossBaseUsdMinor)}
                    </td>
                    <td className="num">
                      {formatUsdMinor(l.withheldUsdMinor)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold" colSpan={5}>
                    Total · {detail.lines.length} transaction
                    {detail.lines.length === 1 ? "" : "s"}
                  </td>
                  <td className="num font-semibold">
                    {formatUsdMinor(detail.totalGrossBaseUsdMinor)}
                  </td>
                  <td className="num font-semibold">
                    {formatUsdMinor(detail.totalWithheldUsdMinor)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="cfo-card-sub mt-[10px] mb-0 max-w-[680px]">
            {DRAFT_NOTE}. Certificate number field intentionally absent —
            attach the DJP/Coretax-issued e-Bupot once filed.
          </p>
        </Card>
      </DevelopmentShell>
    );
  }

  const register = await safeQuery(
    "loadWithholdingRegister",
    loadWithholdingRegister(selected.start, selected.end),
    emptyRegister(selected),
    4000,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          {crumb}
          <h1>
            Bukti potong · PPh withholding register.{" "}
            <span className="text-[var(--amber)]">Per counterparty.</span>
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            {DRAFT_NOTE}. Grouped from PPh-classified transactions
            (USD-normalised, all directions — exactly what the e-Bupot
            declaration aggregates). PPh tax types:{" "}
            {register.pphTaxTypeNames.join(", ") || "none configured"}.
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/finance/tax-reports?period=${selectedKey}`}
            className="btn btn-secondary btn-sm"
          >
            ← Declarations
          </Link>
        </div>
      </div>

      <div className="mb-[18px] flex flex-wrap items-center gap-2">
        <span className="label">Period</span>
        {[...candidates.values()]
          .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0))
          .map((p) => {
            const key = periodParam(p);
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
          label="Counterparties"
          value={String(register.rows.length)}
          sub="with PPh-classified activity"
        />
        <Kpi
          label="Gross base"
          value={formatUsdMinor(register.totalGrossBaseUsdMinor)}
          sub="sum of withholding-classified txns"
        />
        <Kpi
          label="PPh withheld"
          value={formatUsdMinor(register.totalWithheldUsdMinor)}
          sub="source for e-Bupot"
          tone="accent"
        />
      </div>

      <Card padding="default">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">
            Withholding by counterparty · {monthLabel(selected)}
          </h3>
          <HandoffBadge tone="warn">source register — draft</HandoffBadge>
        </div>
        {register.rows.length === 0 ? (
          <EmptyState
            title="No PPh-classified transactions in this period"
            description="Classify transactions with a PPh withholding tax type on the finance ledger, then this register fills in. No certificates are generated from an empty register."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Counterparty</th>
                <th className="num">Transactions</th>
                <th className="num">Gross base (USD)</th>
                <th className="num">PPh withheld (USD)</th>
                <th>Bukti potong</th>
              </tr>
            </thead>
            <tbody>
              {register.rows.map((r) => (
                <tr key={r.counterpartyName || "__none__"}>
                  <td>
                    {r.counterpartyName || (
                      <span className="text-[var(--ink-3)]">
                        {NO_COUNTERPARTY_LABEL}
                      </span>
                    )}
                  </td>
                  <td className="num">{r.transactionCount}</td>
                  <td className="num">
                    {formatUsdMinor(r.grossBaseUsdMinor)}
                  </td>
                  <td className="num">
                    {formatUsdMinor(r.withheldUsdMinor)}
                  </td>
                  <td>
                    <Link
                      href={`?period=${selectedKey}&counterparty=${encodeURIComponent(r.counterpartyName)}`}
                      className="btn btn-secondary btn-sm"
                    >
                      Printable draft →
                    </Link>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="font-semibold">Total</td>
                <td className="num font-semibold">
                  {register.rows.reduce((n, r) => n + r.transactionCount, 0)}
                </td>
                <td className="num font-semibold">
                  {formatUsdMinor(register.totalGrossBaseUsdMinor)}
                </td>
                <td className="num font-semibold">
                  {formatUsdMinor(register.totalWithheldUsdMinor)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </DevelopmentShell>
  );
}
