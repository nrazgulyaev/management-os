"use client";

import * as React from "react";
import { Camera, Check, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ChecklistItem {
  id: string;
  label: string;
  requiresPhoto?: boolean;
  section: string;
}

const items: ChecklistItem[] = [
  { id: "1", section: "Entry", label: "Front door and lockbox secured" },
  { id: "2", section: "Entry", label: "Welcome card placed" },
  { id: "3", section: "Living", label: "Living-room AC at 24°C, fan quiet mode", requiresPhoto: true },
  { id: "4", section: "Living", label: "Cushions steamed and aligned", requiresPhoto: true },
  { id: "5", section: "Kitchen", label: "Espresso machine descaled and refilled" },
  { id: "6", section: "Kitchen", label: "Welcome snack restocked" },
  { id: "7", section: "Kitchen", label: "Fruit basket with fresh selection", requiresPhoto: true },
  { id: "8", section: "Bedrooms", label: "Master bed made with king sheets", requiresPhoto: true },
  { id: "9", section: "Bedrooms", label: "Second bedroom reset (4 pillows)" },
  { id: "10", section: "Bathrooms", label: "Towels replaced — 2 bath, 2 hand, 2 face per guest" },
  { id: "11", section: "Bathrooms", label: "Toiletries restocked to par" },
  { id: "12", section: "Outdoor", label: "Pool surface skimmed, pH verified", requiresPhoto: true },
  { id: "13", section: "Outdoor", label: "Pool deck lounges aligned" },
  { id: "14", section: "Outdoor", label: "Garden tidy, no debris on paths" },
  { id: "15", section: "Tech", label: "Wi-Fi routers blinking, speed test OK" },
  { id: "16", section: "Tech", label: "Smart-TV reset to welcome screen" },
  { id: "17", section: "Final", label: "Scent of villa (lemongrass), windows cracked" },
  { id: "18", section: "Final", label: "Photograph: living room wide", requiresPhoto: true },
  { id: "19", section: "Final", label: "Photograph: master bedroom wide", requiresPhoto: true },
  { id: "20", section: "Final", label: "Photograph: kitchen wide", requiresPhoto: true },
  { id: "21", section: "Final", label: "Photograph: pool and outdoor", requiresPhoto: true },
  { id: "22", section: "Final", label: "Lock-up — gate code reset" },
];

export function TaskChecklist() {
  const [done, setDone] = React.useState<Set<string>>(
    new Set(items.slice(0, 18).map((i) => i.id))
  );
  const [uploaded, setUploaded] = React.useState<Set<string>>(
    new Set(
      items
        .filter((i) => i.requiresPhoto)
        .slice(0, 5)
        .map((i) => i.id)
    )
  );

  const grouped = React.useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    items.forEach((i) => {
      if (!map.has(i.section)) map.set(i.section, []);
      map.get(i.section)!.push(i);
    });
    return Array.from(map.entries());
  }, []);

  const total = items.length;
  const completed = done.size;
  const pct = Math.round((completed / total) * 100);

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePhoto = (id: string) => {
    setUploaded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/field"
        className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink -ml-1"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to today
      </Link>

      <header>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-xs text-ink-tertiary">ES-S2</span>
          <Badge tone="info">Turnover</Badge>
          <Badge tone="outline">P2</Badge>
        </div>
        <h1 className="text-display text-[26px] leading-tight font-medium text-ink">
          Enso S2 · Turnover
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          Scheduled 11:00 · Supervisor: Dewi K.
        </p>
      </header>

      <div className="rounded-md border border-line-soft bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-label">Progress</span>
          <span className="font-mono tabular-nums text-sm text-ink">
            {completed} / {total}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 text-xs text-ink-tertiary tabular-nums">
          {uploaded.size} of {items.filter((i) => i.requiresPhoto).length} required photos uploaded
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {grouped.map(([section, secItems]) => (
          <section key={section}>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-label">{section}</span>
              <span className="text-[11px] text-ink-tertiary tabular-nums">
                {secItems.filter((i) => done.has(i.id)).length}/{secItems.length}
              </span>
            </div>
            <div className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
              {secItems.map((i) => {
                const isDone = done.has(i.id);
                const hasPhoto = uploaded.has(i.id);
                return (
                  <div key={i.id} className="p-3 flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggle(i.id)}
                      className={`w-6 h-6 rounded-sm border shrink-0 inline-flex items-center justify-center transition-colors ${isDone ? "bg-ink border-ink text-ink-inverse" : "bg-surface border-line-strong text-transparent"}`}
                      aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                    >
                      {isDone && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm leading-snug ${isDone ? "text-ink-tertiary line-through" : "text-ink"}`}
                      >
                        {i.label}
                      </p>
                      {i.requiresPhoto && (
                        <button
                          type="button"
                          onClick={() => togglePhoto(i.id)}
                          className={`mt-2 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-sm border transition-colors ${hasPhoto ? "border-success text-success bg-success-weak" : "border-line-soft text-ink-secondary bg-muted"}`}
                        >
                          <Camera className="w-3 h-3" strokeWidth={1.75} />
                          {hasPhoto ? "Photo uploaded" : "Photo required"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="sticky bottom-20 pt-4">
        <Button size="lg" className="w-full">
          Submit to supervisor
        </Button>
        <p className="text-[11px] text-ink-tertiary text-center mt-2">
          Supervisor will review photos and approve or return with notes.
        </p>
      </div>
    </div>
  );
}
