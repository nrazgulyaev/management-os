import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Buyers & installments KPI strip — Dev OS `.kpi` primitive
 * (cabinets/dev-p2/sales.html). Pixel target: mono uppercase label
 * 10.5px / .14em, IBM Plex Mono tabular value 26px, sub 12px ink-3,
 * with semantic value tints (warn for due, danger for overdue) and a
 * danger-tinted border on the overdue tile — exactly the mock's
 * Contracted / Due / Overdue / Auto-remind tiles.
 *
 * Pure presentation over already-fetched plan summaries; no new query.
 */

type KpiTone = "default" | "accent" | "warn" | "danger";

interface KpiTile {
  id: string;
  label: string;
  value: string;
  sub: string;
  tone: KpiTone;
}

const valueTone: Record<KpiTone, string> = {
  default: "text-ink",
  accent: "text-accent",
  warn: "text-warning",
  danger: "text-danger",
};

export interface InstallmentDeskKpiInput {
  /** Total contract value across every plan, USD minor (cents) string. */
  contractedUsdMinor: string;
  /** Outstanding receivable across every plan, USD minor string. */
  outstandingUsdMinor: string;
  /** Count of overdue milestones across every plan. */
  overdueCount: number;
  /** Plans with auto-remind enabled. */
  autoRemindOn: number;
}

function fmtUsdCompact(minor: string): string {
  const dollars = Number(BigInt(minor)) / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

export function InstallmentDeskKpis({
  contractedUsdMinor,
  outstandingUsdMinor,
  overdueCount,
  autoRemindOn,
}: InstallmentDeskKpiInput) {
  const tiles: KpiTile[] = [
    {
      id: "contracted",
      label: "Contracted",
      value: fmtUsdCompact(contractedUsdMinor),
      sub: "total value",
      tone: "default",
    },
    {
      id: "due",
      label: "Due",
      value: fmtUsdCompact(outstandingUsdMinor),
      sub: "outstanding",
      tone: Number(BigInt(outstandingUsdMinor)) > 0 ? "warn" : "default",
    },
    {
      id: "overdue",
      label: "Overdue",
      value: String(overdueCount),
      sub: "payments",
      tone: overdueCount > 0 ? "danger" : "default",
    },
    {
      id: "auto-remind",
      label: "Auto-remind",
      value: String(autoRemindOn),
      sub: "plans on",
      tone: autoRemindOn > 0 ? "accent" : "default",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.id}
          className={cn(
            "rounded-md border bg-surface px-[18px] py-4",
            t.tone === "danger"
              ? "border-danger/35"
              : t.tone === "warn"
                ? "border-warning/35"
                : "border-line-soft",
          )}
        >
          <span className="block font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-tertiary">
            {t.label}
          </span>
          <span
            className={cn(
              "mt-1 block font-mono text-[26px] font-medium leading-[1.05] tabular-nums",
              valueTone[t.tone],
            )}
          >
            {t.value}
          </span>
          <span className="mt-0.5 block text-xs text-ink-tertiary">{t.sub}</span>
        </div>
      ))}
    </div>
  );
}
