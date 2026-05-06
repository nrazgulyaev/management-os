"use client";

import * as React from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export interface ProjectTab {
  value: string;
  label: string;
  badge?: string;
  content: React.ReactNode;
}

export function ProjectDetailTabs({
  tabs,
  defaultValue,
}: {
  tabs: ProjectTab[];
  defaultValue?: string;
}) {
  return (
    <Tabs.Root defaultValue={defaultValue ?? tabs[0]?.value}>
      <Tabs.List
        className="flex items-center gap-1 border-b border-line-soft overflow-x-auto no-scrollbar"
        aria-label="Project sections"
      >
        {tabs.map((t) => (
          <Tabs.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              "relative inline-flex items-center gap-2 h-10 px-3 text-sm text-ink-secondary hover:text-ink",
              "data-[state=active]:text-ink",
              "after:absolute after:left-3 after:right-3 after:-bottom-[1px] after:h-px after:bg-transparent",
              "data-[state=active]:after:bg-ink",
              "transition-colors",
            )}
          >
            {t.label}
            {t.badge && (
              <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-muted text-ink-tertiary">
                {t.badge}
              </span>
            )}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {tabs.map((t) => (
        <Tabs.Content
          key={t.value}
          value={t.value}
          className="pt-6 focus:outline-none"
        >
          {t.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
