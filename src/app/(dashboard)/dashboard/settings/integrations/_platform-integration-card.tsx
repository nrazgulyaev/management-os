"use client";

/**
 * block10-integrations-hub — truthful catalog card for a single PLATFORM /
 * env-configured integration.
 *
 * Replaces the old env-presence → green "Configured" card. This card:
 *   (a) shows the REAL 3-tier trust badge (real / dry-run / ignored / error)
 *       resolved server-side — never a false green;
 *   (b) wires a REAL Test-connection button to `testPlatformIntegrationAction`
 *       which either probes the upstream or honestly reports
 *       dry-run / not-configured;
 *   (c) surfaces an encryption-at-rest indicator when the integration
 *       persists credentials sealed via the platform KMS.
 *
 * Uses @/components/ui primitives + Layer-B tokens. No raw bg-black/style.
 */

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Loader2,
  Lock,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  testPlatformIntegrationAction,
  type PlatformTestResult,
} from "@/lib/integrations/platform-test-actions";
import type {
  PlatformIntegrationKey,
  PlatformTrustTier,
} from "@/lib/integrations/platform-trust";

const TIER_LABEL: Record<PlatformTrustTier, string> = {
  real: "Real",
  dry_run: "Dry-run",
  ignored: "Ignored",
  error: "Error",
};

const TIER_TONE: Record<
  PlatformTrustTier,
  "success" | "warning" | "neutral" | "danger"
> = {
  real: "success",
  dry_run: "warning",
  ignored: "neutral",
  error: "danger",
};

export interface PlatformIntegrationCardProps {
  integrationKey: PlatformIntegrationKey;
  name: string;
  description: string;
  icon: React.ReactNode;
  scope: "per-org" | "platform";
  tier: PlatformTrustTier;
  reason: string;
  /** Whether a real network probe backs the Test button. */
  hasProbe: boolean;
  encryptedAtRest: boolean;
  simulated: boolean;
  configureHref?: string;
}

export function PlatformIntegrationCard({
  integrationKey,
  name,
  description,
  icon,
  scope,
  tier,
  reason,
  hasProbe,
  encryptedAtRest,
  simulated,
  configureHref,
}: PlatformIntegrationCardProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PlatformTestResult | null>(null);

  const runTest = () => {
    setResult(null);
    startTransition(async () => {
      const r = await testPlatformIntegrationAction({ key: integrationKey });
      setResult(r);
    });
  };

  return (
    <article
      className="rounded-3xl border border-line-soft bg-surface p-6 flex flex-col gap-4 shadow-soft-card hover:shadow-elevated-card transition-shadow"
      data-block10="platform-integration-card"
      data-trust-tier={tier}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-2xl bg-muted flex items-center justify-center text-ink-secondary shrink-0">
            {icon}
          </span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <h3 className="text-base font-medium text-ink truncate">{name}</h3>
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-tertiary font-medium">
              {scope === "per-org" ? "Per-org" : "Platform-wide"}
            </span>
          </div>
        </div>
        <Badge tone={TIER_TONE[tier]}>{TIER_LABEL[tier]}</Badge>
      </header>

      <p className="text-sm text-ink-secondary leading-relaxed">{description}</p>

      {/* Truthful tier rationale — the "why this isn't green" line. */}
      <p
        className={cn(
          "text-xs rounded-md px-3 py-2",
          tier === "error"
            ? "text-danger bg-danger-weak/40"
            : simulated || tier === "dry_run"
              ? "text-warning bg-warning-weak/40"
              : "text-ink-secondary bg-muted/40",
        )}
      >
        {simulated && (
          <span className="font-medium uppercase tracking-wide text-[10px] mr-1">
            Simulated ·
          </span>
        )}
        {reason}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {encryptedAtRest && (
          <span className="inline-flex items-center gap-1 text-[11px] text-success">
            <Lock className="w-3 h-3" strokeWidth={2} />
            Encrypted at rest
          </span>
        )}
        {!encryptedAtRest && tier === "real" && (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-tertiary">
            <ShieldCheck className="w-3 h-3" strokeWidth={2} />
            Platform env secret
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={runTest}
          disabled={pending}
          data-testid={`platform-test-${integrationKey}`}
        >
          {pending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <Wifi className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
          <span className="ml-1">
            {hasProbe ? "Test connection" : "Check status"}
          </span>
        </Button>
        {configureHref && (
          <Link
            href={configureHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:text-accent transition-colors"
          >
            Open settings
            <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        )}
      </div>

      {result && <TestResultLine result={result} />}
    </article>
  );
}

function TestResultLine({ result }: { result: PlatformTestResult }) {
  if (!result.ok) {
    return (
      <p className="text-xs text-danger bg-danger-weak/40 rounded-md px-3 py-2">
        Test failed: {result.error}
      </p>
    );
  }
  const tone =
    result.mode === "live" && result.connected
      ? "text-success bg-success-weak/40"
      : result.mode === "live"
        ? "text-danger bg-danger-weak/40"
        : "text-warning bg-warning-weak/40";
  const label =
    result.mode === "live"
      ? result.connected
        ? "Verified ✓"
        : "Live probe failed"
      : result.mode === "dry_run"
        ? "Dry-run"
        : "Not configured";
  return (
    <p className={cn("text-xs rounded-md px-3 py-2", tone)}>
      <span className="font-medium">{label}</span> — {result.detail}
    </p>
  );
}
