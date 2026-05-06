"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LifecycleStage } from "@/lib/development/types";
import { resolveIcon } from "./icon-registry";

export function LifecycleMap({
  stages,
  className,
  highlightedKey,
}: {
  stages: LifecycleStage[];
  className?: string;
  highlightedKey?: LifecycleStage["key"];
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = React.useState<LifecycleStage["key"]>(
    highlightedKey ?? stages[0]?.key ?? "land"
  );
  const activeStage = stages.find((s) => s.key === active) ?? stages[0];

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="relative">
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-line-soft -z-10"
          aria-hidden
        />
        <ol className="flex items-stretch gap-1 overflow-x-auto no-scrollbar pb-1">
          {stages.map((stage, i) => {
            const Icon = resolveIcon(stage.iconKey);
            const isActive = stage.key === active;
            return (
              <li key={stage.id} className="flex items-center shrink-0">
                <motion.button
                  type="button"
                  onMouseEnter={() => setActive(stage.key)}
                  onFocus={() => setActive(stage.key)}
                  onClick={() => setActive(stage.key)}
                  initial={reduced ? { opacity: 1 } : { opacity: 0, y: 6 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{
                    duration: reduced ? 0 : 0.4,
                    delay: reduced ? 0 : i * 0.04,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={cn(
                    "group flex flex-col items-center gap-2 px-3 py-3 rounded-md min-w-[110px] transition-all",
                    isActive
                      ? "bg-surface border border-line-strong shadow-[var(--shadow-rest)]"
                      : "hover:bg-muted border border-transparent"
                  )}
                  aria-current={isActive}
                >
                  <span
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                      isActive
                        ? "bg-accent text-accent-contrast"
                        : "bg-muted text-ink-secondary group-hover:bg-accent-weak group-hover:text-accent"
                    )}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.75} />
                  </span>
                  <span
                    className={cn(
                      "text-[11px] tracking-wide uppercase font-medium",
                      isActive ? "text-ink" : "text-ink-secondary"
                    )}
                  >
                    {stage.name}
                  </span>
                </motion.button>
                {i < stages.length - 1 && (
                  <ChevronRight
                    className="w-3.5 h-3.5 text-ink-tertiary mx-0.5 shrink-0"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {activeStage && (
        <motion.div
          key={activeStage.id}
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-md border border-line-soft bg-surface px-5 py-4 flex flex-col gap-1"
        >
          <span className="text-label">Stage {activeStage.order} of {stages.length}</span>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="text-display text-[20px] leading-tight font-medium text-ink">
              {activeStage.name}
            </h3>
            <span className="text-xs text-ink-tertiary">{activeStage.key}</span>
          </div>
          <p className="text-sm text-ink-secondary leading-relaxed">
            {activeStage.description}
          </p>
        </motion.div>
      )}
    </div>
  );
}
