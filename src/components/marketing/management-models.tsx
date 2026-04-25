"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ModelId = "individual" | "pooled" | "hybrid";

const models: Record<
  ModelId,
  {
    label: string;
    short: string;
    thesis: string;
    description: string;
    bullets: string[];
    distribution: { label: string; amount: string; tone: "ink" | "accent" | "gold" | "muted" }[];
    caption: string;
  }
> = {
  individual: {
    label: "Individual",
    short: "One villa, one owner",
    thesis:
      "Every rupiah of revenue and every expense is tied to the villa. The owner receives a dedicated monthly P&L.",
    description:
      "Best for standalone villas and owners who want full transparency into their specific asset. Reserves grow against the villa, not a pool.",
    bullets: [
      "Villa-specific revenue & expenses",
      "Owner keeps full P&L visibility",
      "Reserves tied to the villa",
      "Payouts match actual performance",
    ],
    distribution: [
      { label: "Gross booking revenue", amount: "Rp 312M", tone: "ink" },
      { label: "OTA + payment + tax", amount: "−Rp 78M", tone: "muted" },
      { label: "Operating & shared", amount: "−Rp 61M", tone: "muted" },
      { label: "Management fee (18%)", amount: "−Rp 31M", tone: "muted" },
      { label: "Reserves (Reno + FF&E)", amount: "−Rp 22M", tone: "muted" },
      { label: "Net owner payout", amount: "Rp 120M", tone: "accent" },
    ],
    caption: "Sample monthly statement · one villa",
  },
  pooled: {
    label: "Pooled",
    short: "One asset, shared yield",
    thesis:
      "Pool members hold a weighted share of net operating profit across the whole project. Occupancy smoothing stabilises income.",
    description:
      "Best for complexes where owners prefer smoothed returns over single-villa variance. Members contribute to one pot of reserves.",
    bullets: [
      "Weighted distribution per share",
      "Smoothed monthly income",
      "Shared operating reserves",
      "Immutable rule version per period",
    ],
    distribution: [
      { label: "Pool net operating profit", amount: "Rp 2.14B", tone: "ink" },
      { label: "Takeda Family Office · 12%", amount: "Rp 256.8M", tone: "accent" },
      { label: "Sonoma Capital · 24%", amount: "Rp 513.6M", tone: "accent" },
      { label: "Emma Whitmore · 3%", amount: "Rp 64.2M", tone: "gold" },
      { label: "Arconique GP · 8%", amount: "Rp 171.2M", tone: "muted" },
      { label: "Other pool members · 53%", amount: "Rp 1.134B", tone: "muted" },
    ],
    caption: "Modelled distribution · Enso pool",
  },
  hybrid: {
    label: "Hybrid",
    short: "Villa-specific revenue · shared costs",
    thesis:
      "The Arconique default. Villa-specific income and costs stay with the owner; shared costs are allocated by immutable, version-controlled rules.",
    description:
      "Best for complexes with common areas and shared services. Owners keep their villa's upside; shared costs follow a documented rule that never rewrites history.",
    bullets: [
      "Individual villa revenue & direct costs",
      "Shared costs split by allocation rule",
      "Rule versions frozen per period",
      "No silent retroactive changes",
    ],
    distribution: [
      { label: "Villa revenue (net)", amount: "Rp 278M", tone: "ink" },
      { label: "Direct villa expenses", amount: "−Rp 44M", tone: "muted" },
      { label: "Pool-allocated shared costs", amount: "−Rp 36M", tone: "muted" },
      { label: "Management fee (18%)", amount: "−Rp 36M", tone: "muted" },
      { label: "Reserves (Reno + FF&E)", amount: "−Rp 22M", tone: "muted" },
      { label: "Net owner payout", amount: "Rp 140M", tone: "accent" },
    ],
    caption: "Sample monthly statement · hybrid villa",
  },
};

const toneClass = (tone: "ink" | "accent" | "gold" | "muted") =>
  tone === "accent"
    ? "text-accent font-semibold"
    : tone === "gold"
      ? "text-gold"
      : tone === "ink"
        ? "text-ink font-medium"
        : "text-ink-secondary";

export function ManagementModels() {
  const [active, setActive] = React.useState<ModelId>("hybrid");
  const m = models[active];

  return (
    <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-6 md:px-8 pt-6 md:pt-8">
        <div>
          <span className="text-label">Management models</span>
          <h3 className="text-display text-[24px] md:text-[28px] leading-tight font-medium mt-2">
            {m.thesis.split(".")[0]}.
          </h3>
        </div>
        <div className="inline-flex p-1 rounded-sm bg-muted border border-line-soft self-start">
          {(Object.keys(models) as ModelId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={cn(
                "px-3 md:px-4 py-2 text-xs md:text-sm rounded-sm transition-colors",
                active === id
                  ? "bg-surface text-ink shadow-[var(--shadow-flat)]"
                  : "text-ink-secondary hover:text-ink"
              )}
            >
              {models[id].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-0 border-t border-line-soft mt-6">
        <div className="md:col-span-2 p-6 md:p-8 border-b md:border-b-0 md:border-r border-line-soft">
          <span className="text-label">{m.short}</span>
          <p className="text-sm text-ink-secondary mt-3 leading-relaxed">
            {m.description}
          </p>
          <ul className="mt-5 flex flex-col gap-2">
            {m.bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-2 text-sm text-ink"
              >
                <span className="w-1 h-1 rounded-full bg-ink-tertiary mt-2 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-3 p-6 md:p-8">
          <div className="flex items-baseline justify-between border-b border-line-soft pb-2">
            <span className="text-label">{m.caption}</span>
            <span className="text-[11px] text-ink-tertiary">Modelled</span>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {m.distribution.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[1fr_auto] items-center gap-4"
              >
                <span className="text-sm text-ink-secondary truncate">
                  {row.label}
                </span>
                <span
                  className={cn(
                    "font-mono tabular-nums text-sm text-right whitespace-nowrap",
                    toneClass(row.tone)
                  )}
                >
                  {row.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
