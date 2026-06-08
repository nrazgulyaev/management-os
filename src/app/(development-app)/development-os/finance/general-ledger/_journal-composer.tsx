"use client";

/**
 * Balanced journal-entry composer (Accounting.html "JEModal") — the missing
 * half of the GL. The double-entry foundation (chart_of_accounts /
 * journal_entries / journal_lines + postJournal + validateJournalEntry +
 * trial balance) shipped in gl-foundation, but there was no way to post an
 * entry by hand. This wires that: pick an account per line, enter a debit OR
 * a credit, watch the live Дт/Кт totals, and Post — disabled until the entry
 * balances (the server re-validates as the binding guarantee).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import {
  postJournalAction,
  type ComposerLineInput,
} from "@/lib/development/server/general-ledger/journal-actions";

interface AccountOption {
  code: string;
  name: string;
  type: string;
}

const emptyLine = (): ComposerLineInput => ({
  accountCode: "",
  debit: "",
  credit: "",
  lineMemo: "",
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function JournalComposer({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  const [entryDate, setEntryDate] = React.useState(todayIso());
  const [currency, setCurrency] = React.useState("USD");
  const [memo, setMemo] = React.useState("");
  const [lines, setLines] = React.useState<ComposerLineInput[]>([
    emptyLine(),
    emptyLine(),
  ]);

  const sumDebit = lines.reduce((s, l) => s + num(l.debit), 0);
  const sumCredit = lines.reduce((s, l) => s + num(l.credit), 0);
  const diff = Math.round((sumDebit - sumCredit) * 100) / 100;
  const validLines = lines.filter((l) => l.accountCode && (num(l.debit) > 0 || num(l.credit) > 0));
  const balanced = diff === 0 && sumDebit > 0 && validLines.length >= 2;

  function patchLine(i: number, patch: Partial<ComposerLineInput>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function reset() {
    setLines([emptyLine(), emptyLine()]);
    setMemo("");
    setEntryDate(todayIso());
  }

  function submit() {
    setError(null);
    setOk(null);
    start(async () => {
      const res = await postJournalAction({ entryDate, currency, memo, lines });
      if (!res.ok) {
        setError(res.error ?? "Could not post the entry.");
        return;
      }
      setOk(`Entry posted (${res.entryId?.slice(0, 8)}).`);
      reset();
      router.refresh();
    });
  }

  const money = (n: number) =>
    `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        New journal entry
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-line-soft bg-surface p-4 flex flex-col gap-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">New journal entry</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-ink-tertiary hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-ink-secondary">
          Date
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="ml-1 text-xs px-2 py-1 rounded border border-line-soft bg-surface"
          />
        </label>
        <label className="text-xs text-ink-secondary">
          Currency
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 4))}
            className="ml-1 w-16 text-xs px-2 py-1 rounded border border-line-soft bg-surface font-mono"
          />
        </label>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="Memo (optional)"
          className="flex-1 min-w-[160px] text-xs px-2 py-1 rounded border border-line-soft bg-surface"
        />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-tertiary text-[11px] uppercase tracking-wide">
            <th className="py-1 font-normal">Account</th>
            <th className="py-1 font-normal text-right w-28">Debit</th>
            <th className="py-1 font-normal text-right w-28">Credit</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="py-1 pr-2">
                <select
                  value={l.accountCode}
                  onChange={(e) => patchLine(i, { accountCode: e.target.value })}
                  className="w-full text-xs px-2 py-1 rounded border border-line-soft bg-surface"
                >
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-1 px-1">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={l.debit}
                  onChange={(e) =>
                    patchLine(i, { debit: e.target.value, credit: "" })
                  }
                  placeholder="0.00"
                  className="w-full text-xs px-2 py-1 rounded border border-line-soft bg-surface font-mono text-right"
                />
              </td>
              <td className="py-1 px-1">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={l.credit}
                  onChange={(e) =>
                    patchLine(i, { credit: e.target.value, debit: "" })
                  }
                  placeholder="0.00"
                  className="w-full text-xs px-2 py-1 rounded border border-line-soft bg-surface font-mono text-right"
                />
              </td>
              <td className="py-1 text-center">
                {lines.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                    className="text-ink-tertiary hover:text-danger"
                    aria-label="Remove line"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line-soft text-xs font-mono">
            <td className="py-1.5 text-right pr-2 text-ink-secondary">Totals</td>
            <td className="py-1.5 text-right tabular-nums">{money(sumDebit)}</td>
            <td className="py-1.5 text-right tabular-nums">{money(sumCredit)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setLines((p) => [...p, emptyLine()])}
          className="text-xs text-ink-secondary hover:text-ink inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add line
        </button>
        <span
          className={`text-xs font-mono ${
            balanced ? "text-success" : "text-ink-tertiary"
          }`}
        >
          {balanced ? "Balanced ✓" : diff === 0 ? "Enter at least 2 lines" : `Out by ${money(Math.abs(diff))}`}
        </span>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {ok && <p className="text-xs text-success">{ok}</p>}

      <div className="flex items-center gap-2">
        <Button onClick={submit} size="sm" disabled={!balanced || pending}>
          {pending ? "Posting…" : "Post entry"}
        </Button>
        <Button onClick={reset} size="sm" variant="secondary" disabled={pending}>
          Reset
        </Button>
      </div>
    </div>
  );
}
