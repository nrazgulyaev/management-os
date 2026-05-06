import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import type { DevelopmentModule } from "@/lib/development/types";
import { resolveIcon } from "./icon-registry";

const statusBadge: Record<
  DevelopmentModule["status"],
  { tone: "accent" | "gold" | "neutral"; label: string }
> = {
  live: { tone: "accent", label: "Live" },
  next: { tone: "gold", label: "Next wave" },
  roadmap: { tone: "neutral", label: "Roadmap" },
};

export function ModuleCard({
  module,
  className,
}: {
  module: DevelopmentModule;
  className?: string;
}) {
  const Icon = resolveIcon(module.iconKey);
  const isInteractive = module.status === "live" || module.status === "next";
  const href = `${DEVELOPMENT_APP_PATH}/${module.slug}`;
  const badge = statusBadge[module.status];

  const content = (
    <div
      className={cn(
        "group relative h-full rounded-md border bg-surface p-5 flex flex-col gap-4 transition-all",
        isInteractive
          ? "border-line-soft hover:border-line-strong hover:shadow-[var(--shadow-raised)] hover:-translate-y-px"
          : "border-dashed border-line-soft opacity-70",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-sm flex items-center justify-center",
            isInteractive
              ? "bg-accent-weak text-accent"
              : "bg-muted text-ink-tertiary"
          )}
        >
          <Icon className="w-5 h-5" strokeWidth={1.6} />
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-medium text-ink">{module.title}</h3>
        <p className="text-sm text-ink-secondary leading-relaxed">
          {module.description}
        </p>
      </div>
      {isInteractive && (
        <div className="mt-auto flex items-center gap-1 text-xs text-ink-tertiary group-hover:text-ink transition-colors">
          <span>Open</span>
          <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
        </div>
      )}
    </div>
  );

  if (!isInteractive) return content;
  return (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  );
}
