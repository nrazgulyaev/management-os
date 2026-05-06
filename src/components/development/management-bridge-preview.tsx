import * as React from "react";
import Link from "next/link";
import { ArrowRight, Building2, HardHat, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

const handoverPayload = [
  "Owner profile & contacts",
  "Management agreement & fee model",
  "As-built drawings & warranty pack",
  "Snag list with sign-off",
  "Initial inventory & FF&E",
];

export function ManagementBridgePreview({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line-soft bg-surface p-6 md:p-8 flex flex-col gap-8",
        className
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-6">
        <BridgeCard
          eyebrow="Development OS"
          title="Build, sell, hand over"
          description="Land, design, permits, construction, sales, investor reporting — every artifact tied to one project record."
          icon={HardHat}
          tone="accent"
        />
        <div
          className="hidden md:flex flex-col items-center justify-center gap-2"
          aria-hidden
        >
          <span className="text-label">Handover</span>
          <div className="relative h-px w-32 bg-line-strong">
            <ArrowRight className="absolute -right-2 -top-2 w-4 h-4 text-ink" />
          </div>
          <span className="text-[11px] text-ink-tertiary">
            single source of truth
          </span>
        </div>
        <BridgeCard
          eyebrow="Management OS"
          title="Operate, report, distribute"
          description="Bookings, housekeeping, owner statements, payouts — the same villa continues its life with no data loss."
          icon={Building2}
          tone="gold"
        />
      </div>

      <div className="rounded-md border border-line-soft bg-canvas px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-accent" strokeWidth={1.75} />
          <span className="text-label">Handover payload</span>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-secondary">
          {handoverPayload.map((p) => (
            <li
              key={p}
              className="inline-flex items-center gap-1.5 before:w-1 before:h-1 before:rounded-full before:bg-ink-tertiary"
            >
              {p}
            </li>
          ))}
        </ul>
        <Link
          href="/villa-management"
          className="text-sm text-accent hover:underline inline-flex items-center gap-1 mt-1"
        >
          See Management OS
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
        </Link>
      </div>
    </div>
  );
}

function BridgeCard({
  eyebrow,
  title,
  description,
  icon: Icon,
  tone,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: "accent" | "gold";
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-5 flex flex-col gap-3 h-full",
        tone === "accent"
          ? "border-accent/20 bg-accent-weak/40"
          : "border-gold/20 bg-gold-weak/40"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-9 h-9 rounded-sm flex items-center justify-center",
            tone === "accent" ? "bg-accent text-accent-contrast" : "bg-gold text-white"
          )}
        >
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </span>
        <span className="text-label">{eyebrow}</span>
      </div>
      <h3 className="text-display text-[20px] leading-tight font-medium text-ink">
        {title}
      </h3>
      <p className="text-sm text-ink-secondary leading-relaxed">
        {description}
      </p>
    </div>
  );
}
