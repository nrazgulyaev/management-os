"use client";

import * as React from "react";
import {
  BarChart3,
  ClipboardList,
  Sparkles,
  Bed,
  KeyRound,
  HandCoins,
  type LucideIcon,
} from "lucide-react";
import { ScrollStagger, ScrollStaggerItem } from "@/components/motion/scroll-reveal";

type Pillar = {
  n: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  tone: "emerald" | "gold" | "sage" | "stone" | "terracotta" | "ink";
  points: string[];
};

const toneBg: Record<Pillar["tone"], string> = {
  emerald: "bg-accent-weak text-accent",
  gold: "bg-gold-weak text-gold",
  sage: "bg-success-weak text-success",
  stone: "bg-muted text-ink-secondary",
  terracotta: "bg-danger-weak text-danger",
  ink: "bg-ink text-ink-inverse",
};

const pillars: Pillar[] = [
  {
    n: "01",
    title: "Investor Reporting",
    desc: "Monthly statements that balance. Pooled profit distributions, reserves, and payouts — every number drillable to source.",
    icon: BarChart3,
    tone: "emerald",
    points: [
      "Gross revenue → net payout, line by line",
      "Hash-signed PDF statements",
      "Individual · pooled · hybrid models",
    ],
  },
  {
    n: "02",
    title: "Villa Operations",
    desc: "Housekeeping, maintenance, preventive, and procurement on one calm operating picture.",
    icon: ClipboardList,
    tone: "sage",
    points: [
      "Photo-verified turnovers",
      "SLA-tracked maintenance",
      "Preventive schedules per villa",
    ],
  },
  {
    n: "03",
    title: "Guest Experience",
    desc: "Boutique-hotel arrival without a download. Tokenized stay pages, smart-lock timing, concierge.",
    icon: Bed,
    tone: "gold",
    points: [
      "No-app web stay page",
      "Smart-lock code at T-24h",
      "Upsells booked in two taps",
    ],
  },
  {
    n: "04",
    title: "Finance & Payouts",
    desc: "Fees, taxes, utilities, reserves, and management fee computed monthly and reconciled against bank.",
    icon: HandCoins,
    tone: "ink",
    points: [
      "PHR, PPN, withholding — explicit",
      "OTA + payment fee attribution",
      "Two-person statement approval",
    ],
  },
  {
    n: "05",
    title: "AI Assistants",
    desc: "Eight permission-aware assistants. Every answer cites a source row. Never invents numbers.",
    icon: Sparkles,
    tone: "stone",
    points: [
      "Investor, Finance, Operations, Concierge",
      "Retrieves under your auth scope",
      "Human approval for sensitive actions",
    ],
  },
  {
    n: "06",
    title: "Smart Access & Control",
    desc: "Time-boxed lock codes, audit-logged camera access, physical-key tracking, privacy-first by design.",
    icon: KeyRound,
    tone: "terracotta",
    points: [
      "Codes expire automatically",
      "Reason-gated camera views",
      "Privacy rules per villa",
    ],
  },
];

export function PillarGrid() {
  return (
    <ScrollStagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-line-soft border border-line-soft rounded-lg overflow-hidden">
      {pillars.map((p) => {
        const Icon = p.icon;
        return (
          <ScrollStaggerItem key={p.n}>
            <article className="h-full bg-surface p-7 flex flex-col gap-5 group transition-colors hover:bg-muted/40">
              <header className="flex items-start justify-between gap-4">
                <div
                  className={`w-10 h-10 rounded-md inline-flex items-center justify-center ${toneBg[p.tone]}`}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <span className="font-mono tabular-nums text-[11px] text-ink-tertiary">
                  {p.n}
                </span>
              </header>
              <div>
                <h3 className="text-display text-[22px] leading-tight font-medium text-ink">
                  {p.title}
                </h3>
                <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
                  {p.desc}
                </p>
              </div>
              <ul className="mt-auto pt-5 border-t border-line-soft flex flex-col gap-2">
                {p.points.map((pt) => (
                  <li
                    key={pt}
                    className="flex items-center gap-2 text-xs text-ink-secondary"
                  >
                    <span className="w-1 h-1 rounded-full bg-ink-tertiary shrink-0" />
                    {pt}
                  </li>
                ))}
              </ul>
            </article>
          </ScrollStaggerItem>
        );
      })}
    </ScrollStagger>
  );
}
