"use client";

/**
 * AP / AR aging view — stacked bucket bar + legend + per-counterparty
 * grouped rows (handoff Accounting.html "AP / AR aging" tab, anglicised).
 *
 * Pure presentation over the server-computed aging report; money arrives
 * as STRING minor units (bigint is not serialisable across the RSC
 * boundary) and is re-hydrated with BigInt for sums. Row actions:
 *   AP → "Pay →" link to the invoice detail page (existing payment form).
 *   AR → "Remind" server action (files an in-app dunning reminder for the
 *        finance team via the notification spine; see _aging-actions.ts).
 */

import * as React from "react";
import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { sendArPaymentReminderAction } from "./_aging-actions";

export interface AgingInvoiceRow {
  id: string;
  invoiceNumber: string;
  counterparty: string;
  currency: string;
  dueDate: string;
  /** bigint minor units serialized as string. */
  outstandingMinor: string;
  daysPastDue: number;
  bucket: "current" | "31-60" | "61-90" | "90+";
}

const BUCKETS = ["current", "31-60", "61-90", "90+"] as const;
type Bucket = (typeof BUCKETS)[number];

const BUCKET_LABEL: Record<Bucket, string> = {
  current: "0–30",
  "31-60": "31–60",
  "61-90": "61–90",
  "90+": "90+",
};

/** Bucket → token-backed swatch class (no raw hex; tokens.css owns color). */
const BUCKET_BG: Record<Bucket, string> = {
  current: "bg-[var(--ok)]",
  "31-60": "bg-[var(--amber-deep)]",
  "61-90": "bg-[var(--warn)]",
  "90+": "bg-[var(--danger)]",
};

const BUCKET_TONE: Record<Bucket, "soft" | "amber" | "warn" | "danger"> = {
  current: "soft",
  "31-60": "amber",
  "61-90": "warn",
  "90+": "danger",
};

function fmtMinor(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const n = Number(abs) / 100;
  return `${neg ? "−" : ""}${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pctOf(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Number((part * 10000n) / total) / 100;
}

interface Group {
  name: string;
  invoices: AgingInvoiceRow[];
  totalMinor: bigint;
  worstBucket: Bucket;
  maxDays: number;
  currencies: Set<string>;
}

type RemindState =
  | { kind: "pending" }
  | { kind: "queued" }
  | { kind: "suppressed" }
  | { kind: "error"; message: string };

export function AgingSection({
  kind,
  rows,
  remindedAt,
}: {
  kind: "ar" | "ap";
  rows: AgingInvoiceRow[];
  /** invoiceId → last reminder filed (ISO date) — AR only, persisted state. */
  remindedAt?: Record<string, string>;
}) {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [remind, setRemind] = React.useState<Record<string, RemindState>>({});
  const [, startTransition] = React.useTransition();

  const { bucketTotals, total, groups } = React.useMemo(() => {
    const bucketTotals: Record<Bucket, bigint> = {
      current: 0n,
      "31-60": 0n,
      "61-90": 0n,
      "90+": 0n,
    };
    let total = 0n;
    const byParty = new Map<string, Group>();
    for (const r of rows) {
      const out = BigInt(r.outstandingMinor);
      bucketTotals[r.bucket] += out;
      total += out;
      const g = byParty.get(r.counterparty) ?? {
        name: r.counterparty,
        invoices: [],
        totalMinor: 0n,
        worstBucket: "current" as Bucket,
        maxDays: Number.MIN_SAFE_INTEGER,
        currencies: new Set<string>(),
      };
      g.invoices.push(r);
      g.totalMinor += out;
      g.currencies.add(r.currency);
      if (BUCKETS.indexOf(r.bucket) > BUCKETS.indexOf(g.worstBucket)) {
        g.worstBucket = r.bucket;
      }
      if (r.daysPastDue > g.maxDays) g.maxDays = r.daysPastDue;
      byParty.set(r.counterparty, g);
    }
    const groups = [...byParty.values()].sort((a, b) => b.maxDays - a.maxDays);
    return { bucketTotals, total, groups };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-3)]">
        No open {kind === "ar" ? "receivables" : "payables"}.
      </p>
    );
  }

  function fileReminder(invoiceId: string) {
    setRemind((s) => ({ ...s, [invoiceId]: { kind: "pending" } }));
    startTransition(async () => {
      const res = await sendArPaymentReminderAction({ invoiceId });
      setRemind((s) => ({
        ...s,
        [invoiceId]: res.ok
          ? { kind: res.status }
          : { kind: "error", message: res.error },
      }));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stacked bucket bar + legend */}
      <div>
        <div className="flex h-[26px] rounded-[7px] overflow-hidden border border-[var(--line-2)]">
          {BUCKETS.map((b) => {
            const pct = pctOf(bucketTotals[b], total);
            if (pct <= 0) return null;
            return (
              <div
                key={b}
                className={`flex items-center justify-center ${BUCKET_BG[b]}`}
                style={{ width: `${pct}%` }}
                title={`${BUCKET_LABEL[b]}: ${fmtMinor(bucketTotals[b])} (${pct.toFixed(1)}%)`}
              >
                {pct > 12 && (
                  <span className="font-mono text-[10px] text-white">
                    {BUCKET_LABEL[b]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
          {BUCKETS.map((b) => (
            <span
              key={b}
              className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-[var(--ink-3)]"
            >
              <span
                className={`inline-block w-[9px] h-[9px] rounded-[3px] ${BUCKET_BG[b]}`}
              />
              {BUCKET_LABEL[b]}: {fmtMinor(bucketTotals[b])}
            </span>
          ))}
          <span className="inline-flex items-center font-mono text-[10.5px] text-[var(--ink)]">
            Total: {fmtMinor(total)}
          </span>
        </div>
      </div>

      {/* Per-counterparty grouped rows */}
      <table className="data">
        <thead>
          <tr>
            <th>Counterparty / invoice</th>
            <th>Due</th>
            <th className="num">Age</th>
            <th>Bucket</th>
            <th className="num">Outstanding</th>
            <th className="num">Action</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isCollapsed = collapsed[g.name] ?? false;
            const groupRow = (
              <tr key={`g:${g.name}`}>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((s) => ({ ...s, [g.name]: !isCollapsed }))
                    }
                    className="inline-flex items-center gap-1.5 font-medium text-[var(--ink)] bg-transparent border-0 p-0 cursor-pointer"
                    aria-expanded={!isCollapsed}
                  >
                    <span className="font-mono text-[10px] text-[var(--ink-3)]">
                      {isCollapsed ? "▸" : "▾"}
                    </span>
                    {g.name}
                    <span className="font-mono text-[10.5px] text-[var(--ink-3)]">
                      · {g.invoices.length} inv
                    </span>
                  </button>
                </td>
                <td className="text-[var(--ink-3)]">—</td>
                <td className="num mono">
                  {g.maxDays > 0 ? `${g.maxDays} d` : "—"}
                </td>
                <td>
                  <HandoffBadge tone={BUCKET_TONE[g.worstBucket]}>
                    {BUCKET_LABEL[g.worstBucket]}
                  </HandoffBadge>
                </td>
                <td className="num font-medium">
                  {fmtMinor(g.totalMinor)}{" "}
                  <span className="text-[var(--ink-3)] font-normal">
                    {g.currencies.size === 1 ? [...g.currencies][0] : "mixed"}
                  </span>
                </td>
                <td className="num" />
              </tr>
            );
            const subRows = isCollapsed
              ? []
              : g.invoices.map((r) => {
                  const state = remind[r.id];
                  const lastReminded = remindedAt?.[r.id];
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link
                          href={`/development-os/finance/invoices/${r.id}`}
                          className="mono text-[12px] pl-[22px] inline-block"
                        >
                          {r.invoiceNumber}
                        </Link>
                      </td>
                      <td className="text-[var(--ink-3)]">{r.dueDate}</td>
                      <td className="num mono">
                        {r.daysPastDue > 0
                          ? `${r.daysPastDue} d`
                          : r.daysPastDue === 0
                            ? "due today"
                            : `in ${-r.daysPastDue} d`}
                      </td>
                      <td>
                        <HandoffBadge tone={BUCKET_TONE[r.bucket]}>
                          {BUCKET_LABEL[r.bucket]}
                        </HandoffBadge>
                      </td>
                      <td className="num">
                        {fmtMinor(BigInt(r.outstandingMinor))}{" "}
                        <span className="text-[var(--ink-3)]">{r.currency}</span>
                      </td>
                      <td className="num">
                        {kind === "ap" ? (
                          <Link
                            href={`/development-os/finance/invoices/${r.id}`}
                            className="btn btn-ghost btn-sm"
                          >
                            Pay →
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-2 justify-end">
                            {state?.kind === "error" && (
                              <span className="text-[11px] text-[var(--danger)]">
                                {state.message}
                              </span>
                            )}
                            {!state && lastReminded && (
                              <span className="font-mono text-[10.5px] text-[var(--ink-3)]">
                                last {lastReminded.slice(0, 10)}
                              </span>
                            )}
                            {state?.kind === "queued" ? (
                              <HandoffBadge tone="ok">Reminded ✓</HandoffBadge>
                            ) : state?.kind === "suppressed" ? (
                              <HandoffBadge tone="soft">
                                Already reminded today
                              </HandoffBadge>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={state?.kind === "pending"}
                                onClick={() => fileReminder(r.id)}
                              >
                                {state?.kind === "pending"
                                  ? "Sending…"
                                  : "Remind"}
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                });
            return [groupRow, ...subRows];
          })}
        </tbody>
      </table>
    </div>
  );
}
