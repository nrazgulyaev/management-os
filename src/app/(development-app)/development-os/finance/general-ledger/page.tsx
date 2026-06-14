import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { safeQuery } from "@/lib/development/safe-query";
import {
  getTrialBalance,
  listGlAccounts,
} from "@/lib/development/server/general-ledger/trial-balance";
import { JournalComposer } from "./_journal-composer";
import { PostFinanceButton } from "./_post-finance-button";

export const metadata: Metadata = {
  title: "General ledger · Development OS",
};
export const dynamic = "force-dynamic";

const TYPE_TONE: Record<string, "info" | "success" | "warning" | "neutral" | "danger"> = {
  asset: "info",
  liability: "warning",
  equity: "neutral",
  revenue: "success",
  expense: "danger",
};

/** Map the legacy Badge tone vocabulary onto the handoff badge palette. */
const HANDOFF_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "soft"
> = {
  success: "ok",
  warning: "warn",
  danger: "danger",
  gold: "gold",
  info: "info",
  neutral: "soft",
};

function fmt(minor: bigint): string {
  const neg = minor < 0n;
  const n = Number(neg ? -minor : minor) / 100;
  return `${neg ? "−" : ""}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function GeneralLedgerPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>General ledger</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const organizationId = await requireOrgId();
  const [tb, accounts] = await Promise.all([
    safeQuery("trialBalance", getTrialBalance(organizationId), {
      rows: [],
      totalDebitMinor: 0n,
      totalCreditMinor: 0n,
      balanced: true,
    }, 4000),
    safeQuery("glAccounts", listGlAccounts(organizationId), [], 4000),
  ]);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>General ledger</span>
          </div>
          <h1>General ledger — trial balance</h1>
          <div className="label mt-2">{`${accounts.length} accounts · ${tb.rows.length} with activity`}</div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Double-entry proving spine over the existing finance sub-ledgers.
            Every posted entry&apos;s debits equal its credits; the whole-ledger
            tie-out below must be balanced. Auto-posting from the operational
            tables lands incrementally.
          </p>
        </div>
        <div className="actions">
          <PostFinanceButton />
          <Link href="/development-os/finance/general-ledger/journal" className="btn btn-secondary btn-sm">
            <BookOpen className="w-4 h-4" strokeWidth={1.75} />
            Journal
          </Link>
          <Link href="/development-os/finance" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Finance
          </Link>
        </div>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="No chart of accounts yet"
          description="Seed the standard chart of accounts for this organization: run `npm run seed:gl-coa`. Then the trial balance will populate as journal entries are posted."
        />
      ) : (
        <>
          <div>
            <div className="label mb-2.5">Post</div>
            <JournalComposer
              accounts={accounts.map((a) => ({
                code: a.code,
                name: a.name,
                type: a.type,
              }))}
            />
          </div>

          <div>
            <div className="label mb-2.5">Tie-out</div>
            <Card padding="default">
              <div className="flex flex-wrap items-center gap-4">
                <HandoffBadge tone={tb.balanced ? "ok" : "danger"}>
                  {tb.balanced ? "Balanced ✓" : "OUT OF BALANCE"}
                </HandoffBadge>
                <span className="text-sm text-ink-secondary font-mono">
                  Σ debits {fmt(tb.totalDebitMinor)} · Σ credits {fmt(tb.totalCreditMinor)}
                  {!tb.balanced && (
                    <span className="text-danger">
                      {" "}· Δ {fmt(tb.totalDebitMinor - tb.totalCreditMinor)}
                    </span>
                  )}
                </span>
              </div>
            </Card>
          </div>

          <div>
            <div className="label mb-2.5">Trial balance</div>
            <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
              Click an account to see the journal lines that compose its balance.
            </p>
            <div className="mb-2.5">
              <Link href="/development-os/finance/general-ledger/journal" className="btn btn-secondary btn-sm">
                Full journal →
              </Link>
            </div>
            {tb.rows.length === 0 ? (
              <p className="text-sm text-ink-tertiary">
                Chart of accounts seeded, but no journal entries posted yet.
                Balances appear once posting is wired (or backfilled).
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Code</TH>
                    <TH>Account</TH>
                    <TH>Type</TH>
                    <TH className="text-right">Debit</TH>
                    <TH className="text-right">Credit</TH>
                    <TH className="text-right">Balance</TH>
                  </TR>
                </THead>
                <TBody>
                  {tb.rows.map((r) => (
                    <TR key={r.code}>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/development-os/finance/general-ledger/accounts/${r.accountId}`}
                          className="hover:underline"
                        >
                          {r.code}
                        </Link>
                      </TD>
                      <TD className="text-sm">
                        <Link
                          href={`/development-os/finance/general-ledger/accounts/${r.accountId}`}
                          className="hover:underline"
                        >
                          {r.name}
                        </Link>
                      </TD>
                      <TD>
                        <HandoffBadge tone={HANDOFF_TONE[TYPE_TONE[r.type] ?? "neutral"]}>{r.type}</HandoffBadge>
                      </TD>
                      <TDNum>{fmt(r.debitMinor)}</TDNum>
                      <TDNum>{fmt(r.creditMinor)}</TDNum>
                      <TDNum>{fmt(r.balanceMinor)}</TDNum>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>

          <div>
            <div className="label mb-2.5">Dimension</div>
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Account</TH>
                  <TH>Type</TH>
                  <TH>Normal</TH>
                  <TH>Note</TH>
                </TR>
              </THead>
              <TBody>
                {accounts.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-mono text-xs">
                      <Link
                        href={`/development-os/finance/general-ledger/accounts/${a.id}`}
                        className="hover:underline"
                      >
                        {a.code}
                      </Link>
                    </TD>
                    <TD className="text-sm">
                      <Link
                        href={`/development-os/finance/general-ledger/accounts/${a.id}`}
                        className="hover:underline"
                      >
                        {a.name}
                      </Link>
                    </TD>
                    <TD>
                      <HandoffBadge tone={HANDOFF_TONE[TYPE_TONE[a.type] ?? "neutral"]}>{a.type}</HandoffBadge>
                    </TD>
                    <TD className="text-xs text-ink-tertiary">{a.normalBalance}</TD>
                    <TD className="text-xs text-ink-secondary">{a.note ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}
    </DevelopmentShell>
  );
}
