import * as React from "react";
import { Calendar, MapPin, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, formatUSD } from "@/lib/utils";
import type {
  BalanceInstallment,
  DevelopmentLandPlot,
} from "@/lib/development/types/projects";

const acquisitionLabel: Record<string, string> = {
  leasehold: "Leasehold",
  freehold: "Freehold",
  joint_venture: "Joint venture",
  mixed: "Mixed",
};

const installmentTone: Record<BalanceInstallment["status"], "accent" | "warning" | "danger" | "neutral"> = {
  paid: "accent",
  pending: "warning",
  overdue: "danger",
  waived: "neutral",
};

function fmtMinor(minor: bigint | null, currency: string | null): string {
  if (minor === null || currency === null) return "—";
  const major = Number(minor) / 100;
  if (currency === "USD" || currency === "EUR") return formatUSD(major);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(major);
}

function fmtAmount(amount: number, currency: string): string {
  if (currency === "USD" || currency === "EUR") return formatUSD(amount);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function LandPlotCard({
  plot,
  className,
}: {
  plot: DevelopmentLandPlot;
  className?: string;
}) {
  const installments = plot.balanceInstallments ?? [];
  const paidCount = installments.filter((i) => i.status === "paid").length;

  // Lease-tenure progress bar (only if leasehold).
  let leasePct: number | null = null;
  let leaseRemainingYears: number | null = null;
  if (plot.leaseStartDate && plot.leaseEndDate) {
    const start = Date.parse(plot.leaseStartDate);
    const end = Date.parse(plot.leaseEndDate);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const now = Date.now();
      leasePct = Math.max(
        0,
        Math.min(100, Math.round(((now - start) / (end - start)) * 100)),
      );
      leaseRemainingYears = Math.max(
        0,
        Math.round((end - now) / (1000 * 60 * 60 * 24 * 365.25)),
      );
    }
  }

  return (
    <article
      className={cn(
        "rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-4",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-medium text-ink">{plot.plotCode}</h3>
            <Badge tone="outline">
              {acquisitionLabel[plot.acquisitionMode] ?? plot.acquisitionMode}
            </Badge>
          </div>
          <p className="text-xs text-ink-tertiary inline-flex items-center gap-1.5">
            <MapPin className="w-3 h-3" strokeWidth={1.75} />
            {plot.areaSqm != null ? `${plot.areaSqm.toLocaleString()} m²` : "Area not set"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-tertiary">Purchase</div>
          <div className="font-mono tabular-nums text-sm text-ink">
            {fmtMinor(plot.purchasePriceMinor, plot.purchaseCurrency)}
          </div>
        </div>
      </header>

      {plot.ownerContactName && (
        <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <User className="w-3 h-3" strokeWidth={1.75} />
          <span>{plot.ownerContactName}</span>
        </div>
      )}

      {leasePct !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-tertiary inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" strokeWidth={1.75} />
              Lease tenure
            </span>
            <span className="font-mono tabular-nums text-ink">
              {leaseRemainingYears} yrs left
            </span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${leasePct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[10px] text-ink-tertiary font-mono">
            <span>{plot.leaseStartDate ? formatDate(plot.leaseStartDate, "short") : "—"}</span>
            <span>{plot.leaseEndDate ? formatDate(plot.leaseEndDate, "short") : "—"}</span>
          </div>
        </div>
      )}

      {(plot.upfrontAmountMinor !== null || installments.length > 0) && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-label">Payments</span>
            <span className="text-xs text-ink-tertiary">
              {paidCount}/{installments.length} installments paid
            </span>
          </div>
          {plot.upfrontAmountMinor !== null && (
            <div className="rounded-sm bg-accent-weak/40 border border-accent/20 px-3 py-2 flex items-center justify-between text-xs">
              <span className="text-accent font-medium">Upfront</span>
              <span className="font-mono tabular-nums text-ink">
                {fmtMinor(plot.upfrontAmountMinor, plot.purchaseCurrency)}
              </span>
            </div>
          )}
          {installments.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {installments.map((inst, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-xs px-3 py-1.5 rounded-sm bg-muted/60 border border-line-soft"
                >
                  <span className="text-ink-tertiary font-mono">
                    {formatDate(inst.dueDate, "short")}
                  </span>
                  <span className="font-mono tabular-nums text-ink">
                    {fmtAmount(inst.amount, inst.currency)}
                  </span>
                  <Badge tone={installmentTone[inst.status]}>{inst.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {plot.notes && (
        <p className="text-xs text-ink-secondary leading-relaxed border-t border-line-soft pt-3">
          {plot.notes}
        </p>
      )}
    </article>
  );
}
