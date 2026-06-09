"use client";

/**
 * Bank-reconciliation matcher (GL leg). For each unmatched bank line, the
 * bookkeeper picks a posted journal entry from a dropdown and ties them.
 * Matched lines can be unmatched. Writes go through the audit-logged
 * server actions; the variance (bank vs. journal net) is shown so the
 * operator sees imperfect ties. Money rendered from bigint minor strings.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  matchBankLineToJournalAction,
  unmatchBankLineFromJournalAction,
} from "@/lib/development/server/general-ledger/bank-reconciliation-actions";

interface UnmatchedLine {
  id: string;
  transactionDate: string;
  description: string;
  counterpartyName: string | null;
  amountMinor: string;
  currency: string;
}

interface MatchedLine extends UnmatchedLine {
  matchId: string;
  journalEntryId: string;
  journalMemo: string | null;
  journalEntryDate: string;
  varianceMinor: string;
  matchMethod: string;
}

interface Candidate {
  id: string;
  entryDate: string;
  memo: string | null;
  netMinor: string;
  currency: string;
}

function fmt(minorStr: string): string {
  const minor = BigInt(minorStr);
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const n = Number(abs) / 100;
  return `${neg ? "−" : ""}${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function ReconciliationMatcher({
  unmatched,
  matched,
  candidates,
}: {
  unmatched: UnmatchedLine[];
  matched: MatchedLine[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [picks, setPicks] = React.useState<Record<string, string>>({});
  const [err, setErr] = React.useState<string | null>(null);

  function match(bankTransactionId: string) {
    const journalEntryId = picks[bankTransactionId];
    if (!journalEntryId) {
      setErr("Pick a journal entry first.");
      return;
    }
    setErr(null);
    start(async () => {
      const r = await matchBankLineToJournalAction({
        bankTransactionId,
        journalEntryId,
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      router.refresh();
    });
  }

  function unmatch(matchId: string) {
    setErr(null);
    start(async () => {
      const r = await unmatchBankLineFromJournalAction({ matchId });
      if (!r.ok) {
        setErr(r.error ?? "Unmatch failed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {err && <p className="text-sm text-danger">{err}</p>}

      <div>
        <h3 className="text-sm font-medium text-ink mb-2">
          Unmatched bank lines · {unmatched.length}
        </h3>
        {unmatched.length === 0 ? (
          <EmptyState
            title="All imported bank lines are tied to the GL"
            description="Import a statement, or post journal entries, then return here to match."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Description</TH>
                <TH>Counterparty</TH>
                <TH className="text-right">Amount</TH>
                <TH>Match to journal entry</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {unmatched.map((t) => (
                <TR key={t.id}>
                  <TD className="text-xs">{t.transactionDate}</TD>
                  <TD className="text-sm">{t.description}</TD>
                  <TD className="text-xs text-ink-secondary">
                    {t.counterpartyName ?? "—"}
                  </TD>
                  <TDNum>
                    {fmt(t.amountMinor)} {t.currency}
                  </TDNum>
                  <TD>
                    <select
                      className="text-xs rounded border border-line-soft bg-surface px-2 py-1 max-w-[260px]"
                      value={picks[t.id] ?? ""}
                      onChange={(e) =>
                        setPicks((p) => ({ ...p, [t.id]: e.target.value }))
                      }
                    >
                      <option value="">Select entry…</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.entryDate} · {fmt(c.netMinor)} ·{" "}
                          {c.memo ?? c.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </TD>
                  <TD>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
                      disabled={pending || !picks[t.id]}
                      onClick={() => match(t.id)}
                    >
                      Match
                    </button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {matched.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-ink mb-2">
            Matched · {matched.length}
          </h3>
          <Table>
            <THead>
              <TR>
                <TH>Bank date</TH>
                <TH>Description</TH>
                <TH className="text-right">Bank amount</TH>
                <TH>Journal entry</TH>
                <TH className="text-right">Variance</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {matched.map((m) => (
                <TR key={m.matchId}>
                  <TD className="text-xs">{m.transactionDate}</TD>
                  <TD className="text-sm">{m.description}</TD>
                  <TDNum>
                    {fmt(m.amountMinor)} {m.currency}
                  </TDNum>
                  <TD className="text-xs text-ink-secondary">
                    {m.journalEntryDate} ·{" "}
                    {m.journalMemo ?? m.journalEntryId.slice(0, 8)}
                  </TD>
                  <TDNum>
                    {BigInt(m.varianceMinor) === 0n ? (
                      <Badge tone="success">Exact</Badge>
                    ) : (
                      <Badge tone="warning">±{fmt(m.varianceMinor)}</Badge>
                    )}
                  </TDNum>
                  <TD>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
                      disabled={pending}
                      onClick={() => unmatch(m.matchId)}
                    >
                      Unmatch
                    </button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
