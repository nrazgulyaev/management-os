/**
 * Stage 10.6.D.2 — IntegrationStatusCard primitive.
 *
 * Surfaces a single external integration's configuration state in a
 * uniform card. Used by the integrations command center
 * (/dashboard/settings/integrations) so the operator can see at a
 * glance: which integrations are configured, which are env-only,
 * which are broken, and where to go to fix each.
 *
 * Status pill semantics:
 *   - "configured"     — fully wired (UI + per-org credentials + test passed)
 *   - "ready"          — env-only or platform-shared but operational
 *   - "needs-config"   — UI exists but operator hasn't configured for their org
 *   - "broken"         — last test/sync failed (surfaces the error tooltip-style)
 *   - "not-available"  — no UI yet, requires env var or platform admin
 */

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type IntegrationStatus =
  | "configured"
  | "ready"
  | "needs-config"
  | "broken"
  | "not-available";

const STATUS_TONE: Record<IntegrationStatus, "success" | "info" | "warning" | "danger" | "neutral"> = {
  configured: "success",
  ready: "info",
  "needs-config": "warning",
  broken: "danger",
  "not-available": "neutral",
};

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  configured: "Configured",
  ready: "Ready",
  "needs-config": "Setup needed",
  broken: "Needs attention",
  "not-available": "Env-only",
};

export interface IntegrationStatusCardProps {
  /** Display name (e.g., "Stripe Connect", "Resend Email"). */
  name: string;
  /** Short description of what this integration does. */
  description: string;
  /** Optional icon — Lucide component or any ReactNode. */
  icon?: React.ReactNode;
  /** Configuration status — drives the badge tone. */
  status: IntegrationStatus;
  /** Optional configure link (operator clicks to set up / edit). */
  configureHref?: string;
  /** Optional secondary text (e.g., "1 account connected", "Last sync 2h ago"). */
  detail?: string;
  /** Optional error message shown when status="broken". */
  errorMessage?: string;
  /** Per-org vs platform-wide. */
  scope: "per-org" | "platform";
  className?: string;
}

export function IntegrationStatusCard({
  name,
  description,
  icon,
  status,
  configureHref,
  detail,
  errorMessage,
  scope,
  className,
}: IntegrationStatusCardProps) {
  return (
    <article
      className={cn(
        "rounded-3xl border border-line-soft bg-surface p-6 flex flex-col gap-4 shadow-soft-card hover:shadow-elevated-card transition-shadow",
        className,
      )}
      data-stage10="integration-status-card"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span className="w-11 h-11 rounded-2xl bg-muted flex items-center justify-center text-ink-secondary shrink-0">
              {icon}
            </span>
          )}
          <div className="flex flex-col gap-0.5 min-w-0">
            <h3 className="text-base font-medium text-ink truncate">{name}</h3>
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-tertiary font-medium">
              {scope === "per-org" ? "Per-org" : "Platform-wide"}
            </span>
          </div>
        </div>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </header>

      <p className="text-sm text-ink-secondary leading-relaxed">{description}</p>

      {detail && (
        <p className="text-xs text-ink-tertiary">{detail}</p>
      )}

      {status === "broken" && errorMessage && (
        <p className="text-xs text-danger bg-danger-weak/40 rounded-md px-3 py-2">
          {errorMessage}
        </p>
      )}

      {configureHref && (
        <Link
          href={configureHref}
          className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-ink hover:text-accent transition-colors"
        >
          {status === "needs-config" || status === "broken"
            ? "Configure"
            : "Open settings"}
          <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
        </Link>
      )}
    </article>
  );
}
