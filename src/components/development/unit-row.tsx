import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn, formatUSD } from "@/lib/utils";
import type { DevelopmentUnitRow } from "@/lib/development/types/projects";

const constructionTone: Record<string, "neutral" | "accent" | "gold" | "info" | "warning"> = {
  planning: "neutral",
  foundation: "info",
  structure: "info",
  mep: "gold",
  finishing: "accent",
  completed: "accent",
  handed_over: "accent",
};

const constructionLabel: Record<string, string> = {
  planning: "Planning",
  foundation: "Foundation",
  structure: "Structure",
  mep: "MEP",
  finishing: "Finishing",
  completed: "Completed",
  handed_over: "Handed over",
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

export function UnitTable({ units }: { units: DevelopmentUnitRow[] }) {
  if (units.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-soft bg-muted/30 px-6 py-10 text-center">
        <p className="text-sm text-ink-secondary">
          No units yet. Units appear here once added to this project.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 border-b border-line-soft">
            <tr className="text-left">
              <Th>Unit</Th>
              <Th>Type</Th>
              <Th>Construction</Th>
              <Th className="text-right">Progress</Th>
              <Th className="text-right">Cost basis</Th>
              <Th className="text-right">Target / market</Th>
              <Th className="text-right">Status</Th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <UnitRow key={u.villaId} unit={u} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary",
        className,
      )}
    >
      {children}
    </th>
  );
}

function UnitRow({ unit }: { unit: DevelopmentUnitRow }) {
  return (
    <tr className="border-b border-line-soft last:border-b-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs text-ink-tertiary">{unit.unitCode}</span>
          <span className="text-sm text-ink">{unit.name ?? "—"}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-ink">{unit.unitTypeName ?? "—"}</span>
          <span className="text-[11px] text-ink-tertiary capitalize">
            {unit.unitCategory.replace("_", " ")} ·{" "}
            {unit.bedrooms}br
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge tone={constructionTone[unit.constructionStatus] ?? "neutral"}>
          {constructionLabel[unit.constructionStatus] ?? unit.constructionStatus}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex flex-col items-end gap-1 min-w-[80px]">
          <span className="font-mono tabular-nums text-sm text-ink">
            {Math.round(unit.constructionProgressPercent)}%
          </span>
          <div className="h-1 w-20 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-accent"
              style={{ width: `${unit.constructionProgressPercent}%` }}
            />
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right font-mono tabular-nums text-sm text-ink-secondary">
        {fmtMinor(unit.costBasisMinor, unit.costBasisCurrency)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono tabular-nums text-sm text-ink">
            {fmtMinor(unit.targetSalePriceMinor, unit.targetSaleCurrency)}
          </span>
          <span className="font-mono tabular-nums text-[11px] text-ink-tertiary">
            mkt {fmtMinor(unit.currentMarketPriceMinor, unit.currentMarketCurrency)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        {unit.isSold ? (
          <Badge tone="accent">Contracted</Badge>
        ) : (
          <Badge tone="outline">Available</Badge>
        )}
        {unit.locationCoefficient !== 1 && (
          <div className="text-[10px] text-ink-tertiary mt-1 font-mono">
            ×{unit.locationCoefficient.toFixed(3)} loc
          </div>
        )}
      </td>
    </tr>
  );
}
