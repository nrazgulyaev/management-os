import * as React from "react";
import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatUSD } from "@/lib/utils";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import type { DevelopmentProject, ProjectHealth } from "@/lib/development/types";

const phaseLabel: Record<DevelopmentProject["phase"], string> = {
  pre_acquisition: "Pre-acquisition",
  acquisition: "Acquisition",
  design: "Design",
  permitting: "Permitting",
  pre_construction: "Pre-construction",
  under_construction: "Under construction",
  fit_out: "Fit-out",
  handover: "Handover",
  managed: "Managed",
  archived: "Archived",
};

const riskTone: Record<DevelopmentProject["aiRiskScore"], "accent" | "gold" | "warning" | "danger"> = {
  low: "accent",
  medium: "gold",
  high: "warning",
  critical: "danger",
};

const riskLabel: Record<DevelopmentProject["aiRiskScore"], string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
  critical: "Critical risk",
};

function fmtMoneyMinor(minor: bigint, currency: DevelopmentProject["currency"]) {
  const major = Number(minor) / 100;
  if (currency === "USD" || currency === "EUR") return formatUSD(major);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(major);
}

export function ProjectHealthCard({
  project,
  health,
  className,
}: {
  project: DevelopmentProject;
  health?: ProjectHealth;
  className?: string;
}) {
  const used = Number(project.budgetUsedMinor);
  const total = Number(project.totalBudgetMinor);
  const budgetPct = total > 0 ? Math.round((used / total) * 100) : 0;
  const driftDays = health?.scheduleDriftDays ?? 0;
  const driftLabel =
    driftDays === 0
      ? "On schedule"
      : driftDays > 0
        ? `${driftDays}d behind`
        : `${Math.abs(driftDays)}d ahead`;
  const driftColor =
    driftDays === 0
      ? "text-ink-tertiary"
      : driftDays > 0
        ? "text-warning"
        : "text-success";

  return (
    <Link
      href={`${DEVELOPMENT_APP_PATH}/projects/${project.slug}`}
      className={cn(
        "group block rounded-md border border-line-soft bg-surface overflow-hidden hover:border-line-strong hover:shadow-[var(--shadow-raised)] transition-all",
        className
      )}
    >
      <div
        className="h-24 w-full"
        style={{ background: project.heroToken }}
        aria-hidden
      />
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h3 className="text-base font-medium text-ink truncate">
              {project.name}
            </h3>
            <p className="text-xs text-ink-tertiary truncate">
              {project.location} · {phaseLabel[project.phase]}
            </p>
          </div>
          <Badge tone={riskTone[project.aiRiskScore]}>
            {riskLabel[project.aiRiskScore]}
          </Badge>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-tertiary">Construction</span>
            <span className="font-mono tabular-nums text-ink">
              {project.constructionProgressPct}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-accent"
              style={{ width: `${project.constructionProgressPct}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex flex-col gap-0.5">
            <dt className="text-ink-tertiary">Budget used</dt>
            <dd className="font-mono tabular-nums text-ink">
              {fmtMoneyMinor(project.budgetUsedMinor, project.currency)}
              <span className="text-ink-tertiary"> / {fmtMoneyMinor(project.totalBudgetMinor, project.currency)}</span>
            </dd>
            <dd className="text-[11px] text-ink-tertiary">{budgetPct}% of plan</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-ink-tertiary">Units sold</dt>
            <dd className="font-mono tabular-nums text-ink">
              {project.unitsSold} / {project.units}
            </dd>
            <dd className={cn("text-[11px]", driftColor)}>{driftLabel}</dd>
          </div>
        </dl>

        {project.nextMilestone && (
          <div className="flex items-start gap-2 rounded-sm bg-muted/60 border border-line-soft px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" strokeWidth={1.75} />
            <span className="text-xs text-ink-secondary leading-snug">
              {project.nextMilestone}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-ink-tertiary group-hover:text-ink transition-colors">
          <span>Open project</span>
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
        </div>
      </div>
    </Link>
  );
}
