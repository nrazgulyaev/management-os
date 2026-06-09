import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
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
        <PageHeader title="General ledger" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "General ledger" },
        ]}
        eyebrow={`${accounts.length} accounts · ${tb.rows.length} with activity`}
        title="General ledger — trial balance"
        description="Double-entry proving spine over the existing finance sub-ledgers. Every posted entry's debits equal its credits; the whole-ledger tie-out below must be balanced. Auto-posting from the operational tables lands incrementally."
        actions={
          <div className="flex items-start gap-2">
            <PostFinanceButton />
            <Button asChild variant="secondary">
              <Link href="/development-os/finance">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Finance
              </Link>
            </Button>
          </div>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="No chart of accounts yet"
          description="Seed the standard chart of accounts for this organization: run `npm run seed:gl-coa`. Then the trial balance will populate as journal entries are posted."
        />
      ) : (
        <>
          <Section eyebrow="Post" title="New journal entry">
            <JournalComposer
              accounts={accounts.map((a) => ({
                code: a.code,
                name: a.name,
                type: a.type,
              }))}
            />
          </Section>

          <Section eyebrow="Tie-out" title="Whole-ledger balance check">
            <div className="flex flex-wrap items-center gap-4">
              <Badge tone={tb.balanced ? "success" : "danger"}>
                {tb.balanced ? "Balanced ✓" : "OUT OF BALANCE"}
              </Badge>
              <span className="text-sm text-ink-secondary font-mono">
                Σ debits {fmt(tb.totalDebitMinor)} · Σ credits {fmt(tb.totalCreditMinor)}
                {!tb.balanced && (
                  <span className="text-danger">
                    {" "}· Δ {fmt(tb.totalDebitMinor - tb.totalCreditMinor)}
                  </span>
                )}
              </span>
            </div>
          </Section>

          <Section eyebrow="Trial balance" title="Account balances">
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
                      <TD className="font-mono text-xs">{r.code}</TD>
                      <TD className="text-sm">{r.name}</TD>
                      <TD>
                        <Badge tone={TYPE_TONE[r.type] ?? "neutral"}>{r.type}</Badge>
                      </TD>
                      <TDNum>{fmt(r.debitMinor)}</TDNum>
                      <TDNum>{fmt(r.creditMinor)}</TDNum>
                      <TDNum>{fmt(r.balanceMinor)}</TDNum>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Section>

          <Section eyebrow="Dimension" title={`Chart of accounts · ${accounts.length}`}>
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
                    <TD className="font-mono text-xs">{a.code}</TD>
                    <TD className="text-sm">{a.name}</TD>
                    <TD>
                      <Badge tone={TYPE_TONE[a.type] ?? "neutral"}>{a.type}</Badge>
                    </TD>
                    <TD className="text-xs text-ink-tertiary">{a.normalBalance}</TD>
                    <TD className="text-xs text-ink-secondary">{a.note ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Section>
        </>
      )}
    </DevelopmentShell>
  );
}
