import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { safeQuery } from "@/lib/development/safe-query";
import {
  listJournalEntries,
  journalSourceLabel,
  EMPTY_JOURNAL_PAGE,
} from "@/lib/development/server/general-ledger/journal-browse";
import { formatMoneyMinor } from "@/lib/money";

export const metadata: Metadata = {
  title: "Journal · General ledger · Development OS",
};
export const dynamic = "force-dynamic";

function statusTone(status: string): "ok" | "danger" | "soft" {
  if (status === "posted") return "ok";
  if (status === "void") return "danger";
  return "soft";
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
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
              <Link href="/development-os/finance">Finance</Link> /{" "}
              <Link href="/development-os/finance/general-ledger">
                General ledger
              </Link>{" "}
              / Journal
            </div>
            <h1>Journal.</h1>
          </div>
        </div>
        <EmptyState
          title="The journal runs against the database"
          description="Database connection not configured. Contact support."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      </DevelopmentShell>
    );
  }

  const organizationId = await requireOrgId();
  const requestedPage = Math.max(
    Number.parseInt(sp.page ?? "1", 10) || 1,
    1,
  );
  const journal = await safeQuery(
    "listJournalEntries",
    listJournalEntries(organizationId, { page: requestedPage, pageSize: 50 }),
    { ...EMPTY_JOURNAL_PAGE, page: requestedPage, pageSize: 50 },
    4000,
  );
  const totalPages = Math.max(
    Math.ceil(journal.totalEntries / journal.pageSize),
    1,
  );
  const firstIndex = (journal.page - 1) * journal.pageSize + 1;
  const lastIndex = Math.min(
    journal.page * journal.pageSize,
    journal.totalEntries,
  );

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
            / Journal
          </div>
          <h1>
            Journal of entries.{" "}
            <span className="text-[var(--amber)]">Every line balanced.</span>
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Every operation is a balanced entry (debits = credits) with its
            per-account lines, provenance, and posted status. The trial
            balance, balance sheet, and tax filings are all derived from this
            journal — one source of truth. Newest first.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/finance/general-ledger"
            className="btn btn-secondary btn-sm"
          >
            ← Trial balance
          </Link>
          <Link
            href="/development-os/finance/general-ledger"
            className="btn btn-amber btn-sm"
          >
            + Journal entry
          </Link>
        </div>
      </div>

      <div className="cfo-kpis">
        <Kpi
          label="Journal entries"
          value={journal.totalEntries.toLocaleString("en-US")}
          sub="all time"
        />
        <Kpi
          label="Posted"
          value={journal.postedEntries.toLocaleString("en-US")}
          sub="in the trial balance"
          tone="success"
        />
        <Kpi
          label="Void"
          value={journal.voidEntries.toLocaleString("en-US")}
          sub="excluded from balances"
          tone={journal.voidEntries > 0 ? "warn" : undefined}
        />
      </div>

      <Card padding="default">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">Journal</h3>
          <span className="label">
            {journal.totalEntries === 0
              ? "no entries"
              : `entries ${firstIndex}–${lastIndex} of ${journal.totalEntries}`}
          </span>
        </div>
        {journal.entries.length === 0 ? (
          <EmptyState
            title={
              journal.totalEntries === 0
                ? "No journal entries yet"
                : "Nothing on this page"
            }
            description={
              journal.totalEntries === 0
                ? "Post the first entry with the composer on the trial-balance page, or run “Post finance to GL” to auto-post the revenue/expense sub-ledgers."
                : "This page is past the end of the journal."
            }
            action={
              <Link
                href="/development-os/finance/general-ledger"
                className="btn btn-secondary btn-sm"
              >
                Open trial balance
              </Link>
            }
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Operation</th>
                <th>Account</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {journal.entries.map((e) => {
                const span = Math.max(e.lines.length, 1);
                if (e.lines.length === 0) {
                  return (
                    <tr key={e.id}>
                      <td className="mono text-[11px] text-[var(--ink-4)]">
                        {e.entryDate}
                      </td>
                      <td>
                        <div className="font-medium">{e.memo ?? "—"}</div>
                        <HandoffBadge tone={statusTone(e.status)}>
                          {e.status}
                        </HandoffBadge>
                      </td>
                      <td
                        colSpan={3}
                        className="text-[var(--ink-4)] text-[12px]"
                      >
                        No lines (data issue — postJournal never writes
                        line-less entries)
                      </td>
                      <td className="text-[11.5px] text-[var(--ink-3)]">
                        {journalSourceLabel(e.sourceTable)}
                      </td>
                    </tr>
                  );
                }
                return (
                  <Fragment key={e.id}>
                    {e.lines.map((l, i) => (
                      <tr key={l.id}>
                        {i === 0 && (
                          <td
                            rowSpan={span}
                            className="align-top mono text-[11px] text-[var(--ink-4)]"
                          >
                            {e.entryDate}
                          </td>
                        )}
                        {i === 0 && (
                          <td rowSpan={span} className="align-top">
                            <div className="font-medium">
                              {e.memo ?? "—"}
                            </div>
                            <div className="mt-[5px]">
                              <HandoffBadge tone={statusTone(e.status)}>
                                {e.status}
                              </HandoffBadge>
                            </div>
                          </td>
                        )}
                        <td>
                          <span className="mono text-[11px]">
                            {l.accountCode}
                          </span>{" "}
                          <Link
                            href={`/development-os/finance/general-ledger/accounts/${l.accountId}`}
                            className="hover:underline"
                          >
                            {l.accountName}
                          </Link>
                          {l.lineMemo && (
                            <span className="text-[11.5px] text-[var(--ink-4)]">
                              {" "}
                              · {l.lineMemo}
                            </span>
                          )}
                        </td>
                        <td className="num">
                          {l.debitMinor > 0n
                            ? formatMoneyMinor(l.debitMinor, e.currency)
                            : ""}
                        </td>
                        <td className="num">
                          {l.creditMinor > 0n
                            ? formatMoneyMinor(l.creditMinor, e.currency)
                            : ""}
                        </td>
                        {i === 0 && (
                          <td
                            rowSpan={span}
                            className="align-top text-[11.5px] text-[var(--ink-3)]"
                          >
                            {journalSourceLabel(e.sourceTable)}
                            {e.externalRef && (
                              <div className="mono text-[10.5px] text-[var(--ink-4)]">
                                {e.externalRef}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {journal.totalEntries > 0 && (
          <div className="flex items-center gap-3 mt-[14px]">
            {journal.page > 1 && (
              <Link
                href={`/development-os/finance/general-ledger/journal?page=${journal.page - 1}`}
                className="btn btn-secondary btn-sm"
              >
                ← Newer
              </Link>
            )}
            <span className="label">
              page {journal.page} of {totalPages}
            </span>
            {journal.hasMore && (
              <Link
                href={`/development-os/finance/general-ledger/journal?page=${journal.page + 1}`}
                className="btn btn-secondary btn-sm"
              >
                Older →
              </Link>
            )}
          </div>
        )}
      </Card>
    </DevelopmentShell>
  );
}
