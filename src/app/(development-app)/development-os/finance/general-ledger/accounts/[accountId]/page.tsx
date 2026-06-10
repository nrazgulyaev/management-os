import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  getAccountLedger,
  journalSourceLabel,
} from "@/lib/development/server/general-ledger/journal-browse";
import { formatMoneyMinor } from "@/lib/money";

export const metadata: Metadata = {
  title: "Account ledger · General ledger · Development OS",
};
export const dynamic = "force-dynamic";

const TYPE_TONE: Record<
  string,
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  asset: "info",
  liability: "warn",
  equity: "soft",
  revenue: "ok",
  expense: "danger",
};

const paramsSchema = z.object({ accountId: z.string().uuid() });

export default async function AccountLedgerPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/finance">Finance</Link> /{" "}
              <Link href="/development-os/finance/general-ledger">
                General ledger
              </Link>{" "}
              / Account
            </div>
            <h1>Account ledger.</h1>
          </div>
        </div>
        <EmptyState
          title="The account ledger runs against the database"
          description="Database connection not configured. Contact support."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      </DevelopmentShell>
    );
  }

  const organizationId = await requireOrgId();
  const ledger = await getAccountLedger(
    organizationId,
    parsed.data.accountId,
    { limit: 200 },
  );
  if (!ledger) notFound();

  const { account } = ledger;
  // All GL lines for one entry share the entry currency; mixed-currency
  // accounts would make a single running balance meaningless, so flag it.
  const currencies = new Set(ledger.rows.map((r) => r.currency));
  const currency = currencies.size === 1 ? [...currencies][0] : "USD";
  const mixedCurrencies = currencies.size > 1;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <Link href="/development-os/finance/general-ledger">
              General ledger
            </Link>{" "}
            / {account.code}
          </div>
          <h1>
            <span className="mono">{account.code}</span> · {account.name}
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            The posted journal lines that compose this account&apos;s
            trial-balance figure, newest first, with the running balance after
            each line ({account.normalBalance}-normal account).
            {account.note ? ` ${account.note}` : ""}
          </p>
          <div className="mt-2 flex gap-2">
            <HandoffBadge tone={TYPE_TONE[account.type] ?? "soft"}>
              {account.type}
            </HandoffBadge>
            <HandoffBadge tone="soft">
              {account.normalBalance}-normal
            </HandoffBadge>
          </div>
        </div>
        <div className="actions">
          <Link
            href="/development-os/finance/general-ledger"
            className="btn btn-secondary btn-sm"
          >
            ← Trial balance
          </Link>
          <Link
            href="/development-os/finance/general-ledger/journal"
            className="btn btn-secondary btn-sm"
          >
            Full journal →
          </Link>
        </div>
      </div>

      <div className="cfo-kpis">
        <Kpi
          label="Balance"
          value={formatMoneyMinor(ledger.balanceMinor, currency)}
          sub={`${account.normalBalance}-normal direction`}
          tone={ledger.balanceMinor < 0n ? "warn" : "accent"}
        />
        <Kpi
          label="Total debits"
          value={formatMoneyMinor(ledger.totalDebitMinor, currency)}
          sub="posted lines"
        />
        <Kpi
          label="Total credits"
          value={formatMoneyMinor(ledger.totalCreditMinor, currency)}
          sub="posted lines"
        />
        <Kpi
          label="Journal lines"
          value={ledger.totalLines.toLocaleString("en-US")}
          sub={
            ledger.totalLines > ledger.rows.length
              ? `showing latest ${ledger.rows.length}`
              : "all shown"
          }
        />
      </div>

      {mixedCurrencies && (
        <Card padding="tight" className="mb-[18px]">
          <span className="label">
            Lines on this account span multiple currencies (
            {[...currencies].join(", ")}) — amounts below are shown per line in
            the entry currency; totals and the running balance sum raw minor
            units without FX conversion.
          </span>
        </Card>
      )}

      <Card padding="default">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">Ledger lines</h3>
          <span className="label">
            {ledger.totalLines === 0
              ? "no posted lines"
              : ledger.totalLines > ledger.rows.length
                ? `latest ${ledger.rows.length} of ${ledger.totalLines} · newest first`
                : `${ledger.totalLines} lines · newest first`}
          </span>
        </div>
        {ledger.rows.length === 0 ? (
          <EmptyState
            title="No posted journal lines yet"
            description="This account has no activity. Its balance appears here as soon as a posted journal entry touches it."
            action={
              <Link
                href="/development-os/finance/general-ledger"
                className="btn btn-secondary btn-sm"
              >
                Post an entry
              </Link>
            }
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Operation</th>
                <th>Source</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((r) => (
                <tr key={r.lineId}>
                  <td className="mono text-[11px] text-[var(--ink-4)]">
                    {r.entryDate}
                  </td>
                  <td>
                    <div className="font-medium">{r.memo ?? "—"}</div>
                    {r.lineMemo && (
                      <span className="text-[11.5px] text-[var(--ink-4)]">
                        {r.lineMemo}
                      </span>
                    )}
                  </td>
                  <td className="text-[11.5px] text-[var(--ink-3)]">
                    {journalSourceLabel(r.sourceTable)}
                  </td>
                  <td className="num">
                    {r.debitMinor > 0n
                      ? formatMoneyMinor(r.debitMinor, r.currency)
                      : ""}
                  </td>
                  <td className="num">
                    {r.creditMinor > 0n
                      ? formatMoneyMinor(r.creditMinor, r.currency)
                      : ""}
                  </td>
                  <td className="num mono">
                    {formatMoneyMinor(r.runningMinor, r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ledger.rows.length > 0 && (
          <p className="label mt-[12px] mb-0">
            Balance = account balance after each line ({account.normalBalance}
            -normal). The top row equals the trial-balance figure.
          </p>
        )}
      </Card>
    </DevelopmentShell>
  );
}
