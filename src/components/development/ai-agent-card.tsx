import * as React from "react";
import { Check, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AIAgent } from "@/lib/development/types";
import { resolveIcon } from "./icon-registry";

const statusTone: Record<AIAgent["status"], { tone: "accent" | "gold" | "neutral"; label: string }> = {
  live: { tone: "accent", label: "Shipping first" },
  next: { tone: "gold", label: "Next" },
  roadmap: { tone: "neutral", label: "Roadmap" },
};

export function AIAgentCard({
  agent,
  variant = "feature",
  className,
}: {
  agent: AIAgent;
  variant?: "feature" | "compact";
  className?: string;
}) {
  const Icon = resolveIcon(agent.iconKey);
  const isLive = agent.status === "live";
  const meta = statusTone[agent.status];

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-line-soft bg-surface px-4 py-3 flex items-center gap-3",
          className
        )}
      >
        <span className="w-9 h-9 rounded-sm bg-muted text-ink-tertiary flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" strokeWidth={1.6} />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-ink truncate">
            {agent.name}
          </span>
          <span className="text-xs text-ink-tertiary inline-flex items-center gap-1">
            <Clock className="w-3 h-3" strokeWidth={1.75} />
            On the roadmap
          </span>
        </div>
      </div>
    );
  }

  return (
    <article
      className={cn(
        "rounded-md border bg-surface p-6 flex flex-col gap-5 h-full",
        isLive ? "border-line-soft shadow-[var(--shadow-rest)]" : "border-dashed border-line-soft",
        className
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "w-11 h-11 rounded-sm flex items-center justify-center",
            isLive ? "bg-accent text-accent-contrast" : "bg-muted text-ink-tertiary"
          )}
        >
          <Icon className="w-5 h-5" strokeWidth={1.6} />
        </span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </header>
      <div className="flex flex-col gap-2">
        <h3 className="text-display text-[20px] leading-tight font-medium text-ink">
          {agent.name}
        </h3>
        <p className="text-sm text-ink-secondary leading-relaxed">
          {agent.description}
        </p>
      </div>
      <ul className="flex flex-col gap-2 mt-auto pt-4 border-t border-line-soft">
        {agent.capabilities.map((cap) => (
          <li
            key={cap}
            className="flex items-start gap-2 text-sm text-ink-secondary"
          >
            <Check
              className={cn(
                "w-3.5 h-3.5 mt-1 shrink-0",
                isLive ? "text-accent" : "text-ink-tertiary"
              )}
              strokeWidth={2.25}
            />
            <span>{cap}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
