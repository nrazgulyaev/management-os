"use client";

/**
 * block10-integrations-hub — truthful catalog card for a single PLATFORM /
 * env-configured integration.
 *
 * pixel-mgmt-integrations-deep — the landing-only redesign pass left this
 * catalog card + its connect/test flow on the LEGACY surface tokens
 * (bg-surface / rounded-3xl / shadow-soft-card / bg-muted / text-ink-
 * secondary). This file re-skins it to the management-lineage chrome from
 * cabinets/mgmt-p3/Integrations.html — the `.in-card` connection tile
 * (44×44 logo block, Newsreader name, mono kind, `.badge` trust pill) plus
 * a `<Modal>`/`<ModalSteps>` connect-wizard that fronts the per-service
 * connect/disconnect flow.
 *
 * The card still:
 *   (a) shows the REAL 3-tier trust badge (real / dry-run / ignored / error)
 *       resolved server-side — never a false green;
 *   (b) wires a REAL Test-connection probe to `testPlatformIntegrationAction`
 *       which either probes the upstream or honestly reports
 *       dry-run / not-configured (now surfaced inside the wizard);
 *   (c) surfaces an encryption-at-rest indicator when the integration
 *       persists credentials sealed via the platform KMS;
 *   (d) routes the actual connect/disconnect to the integration's real
 *       configure sub-route — NO net-new backend, NO localStorage demo.
 *
 * Uses @/components/ui + dashboard primitives + Layer-B tokens only.
 * No raw bg-black / bg-stone / hex / inline style.
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
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalSteps,
} from "@/components/ui/modal";
import {
  testPlatformIntegrationAction,
  type PlatformTestResult,
} from "@/lib/integrations/platform-test-actions";
import type {
  PlatformIntegrationKey,
  PlatformTrustTier,
} from "@/lib/integrations/platform-trust";

const TIER_LABEL: Record<PlatformTrustTier, string> = {
  real: "Connected",
  dry_run: "Dry-run",
  ignored: "Available",
  error: "Error",
};

/** Maps the trust tier onto the chrome `.badge-*` palette from the mock. */
const TIER_BADGE: Record<PlatformTrustTier, string> = {
  real: "badge-ok",
  dry_run: "badge-warn",
  ignored: "badge-soft",
  error: "badge-danger",
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
  const [wizardOpen, setWizardOpen] = useState(false);

  const runTest = () => {
    setResult(null);
    startTransition(async () => {
      const r = await testPlatformIntegrationAction({ key: integrationKey });
      setResult(r);
    });
  };

  const isConnected = tier === "real";

  return (
    <article
      className="card flex flex-col gap-3 px-[18px] py-[18px]"
      data-block10="platform-integration-card"
      data-trust-tier={tier}
    >
      {/* .in-card .top — 44×44 logo, name + mono kind, trust pill */}
      <header className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-cream-deep text-ink-2">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="display truncate text-[17px] font-semibold leading-tight text-ink">
            {name}
          </div>
          <div className="mono text-[10.5px] uppercase tracking-[0.1em] text-ink-4">
            {scope === "per-org" ? "Per-org service" : "Platform-wide"}
          </div>
        </div>
        <span className={cn("badge", TIER_BADGE[tier])}>{TIER_LABEL[tier]}</span>
      </header>

      <p className="text-[12.5px] leading-[1.5] text-ink-3">{description}</p>

      {/* Truthful tier rationale — the "why this isn't green" line. */}
      <p
        className={cn(
          "rounded-[8px] px-3 py-2 text-[12px] leading-snug",
          tier === "error"
            ? "bg-danger-weak/40 text-danger"
            : simulated || tier === "dry_run"
              ? "bg-warning-weak/40 text-warn"
              : "bg-cream-deep/50 text-ink-3",
        )}
      >
        {simulated && (
          <span className="mono mr-1 text-[10px] uppercase tracking-wide">
            Simulated ·
          </span>
        )}
        {reason}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {encryptedAtRest && (
          <span className="inline-flex items-center gap-1 text-[11px] text-ok">
            <Lock className="h-3 w-3" strokeWidth={2} />
            Encrypted at rest
          </span>
        )}
        {!encryptedAtRest && tier === "real" && (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-4">
            <ShieldCheck className="h-3 w-3" strokeWidth={2} />
            Platform env secret
          </span>
        )}
      </div>

      {/* .in-card .foot — primary connect/manage CTA + inline probe */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          className="btn btn-accent btn-sm"
          onClick={() => {
            setResult(null);
            setWizardOpen(true);
          }}
          data-testid={`platform-connect-${integrationKey}`}
        >
          {isConnected ? "Manage" : "Connect"}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={runTest}
          disabled={pending}
          data-testid={`platform-test-${integrationKey}`}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <Wifi className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          <span className="ml-1">
            {hasProbe ? "Test connection" : "Check status"}
          </span>
        </button>
      </div>

      {result && <TestResultLine result={result} />}

      <ConnectWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        name={name}
        icon={icon}
        scope={scope}
        tier={tier}
        reason={reason}
        hasProbe={hasProbe}
        encryptedAtRest={encryptedAtRest}
        simulated={simulated}
        configureHref={configureHref}
        pending={pending}
        result={result}
        onRunTest={runTest}
      />
    </article>
  );
}

/**
 * Per-service connect / disconnect wizard — pixel-matches the mock's
 * `.modal` + `.modal-steps` flow. It is NOT a localStorage demo: it fronts
 * the integration's REAL test-connection probe + real configure sub-route,
 * so connecting/disconnecting happens against the genuine wiring.
 */
function ConnectWizard({
  open,
  onClose,
  name,
  icon,
  scope,
  tier,
  reason,
  hasProbe,
  encryptedAtRest,
  simulated,
  configureHref,
  pending,
  result,
  onRunTest,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  icon: React.ReactNode;
  scope: "per-org" | "platform";
  tier: PlatformTrustTier;
  reason: string;
  hasProbe: boolean;
  encryptedAtRest: boolean;
  simulated: boolean;
  configureHref?: string;
  pending: boolean;
  result: PlatformTestResult | null;
  onRunTest: () => void;
}) {
  const isConnected = tier === "real";
  const stepState: "done" | "on" | "todo" =
    result == null ? "todo" : result.ok ? "done" : "todo";

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} size="md">
      <ModalHeader
        glyph={icon}
        glyphTone={tier === "error" ? "danger" : isConnected ? "ok" : "accent"}
        title={`${isConnected ? "Manage" : "Connect"} · ${name}`}
        description={
          scope === "per-org"
            ? "Per-org service. Credentials are sealed at rest and drive this workspace's runtime."
            : "Platform-wide service shared across every workspace."
        }
        onClose={onClose}
      />

      <ModalSteps
        steps={[
          {
            id: "verify",
            label: "Verify",
            state: result ? (result.ok ? "done" : "on") : "on",
          },
          { id: "configure", label: "Configure", state: stepState },
        ]}
      />

      <ModalBody>
        <div className="field">
          <span className="field-label">Current trust tier</span>
          <p
            className={cn(
              "rounded-[8px] px-3 py-2 text-[12.5px] leading-snug",
              tier === "error"
                ? "bg-danger-weak/40 text-danger"
                : simulated || tier === "dry_run"
                  ? "bg-warning-weak/40 text-warn"
                  : isConnected
                    ? "bg-success-weak/40 text-ok"
                    : "bg-cream-deep/50 text-ink-3",
            )}
          >
            {reason}
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
          <div className="flex items-center justify-between gap-3 py-[7px] text-[13px]">
            <span className="text-ink-4">Scope</span>
            <b className="font-semibold text-ink">
              {scope === "per-org" ? "Per-org" : "Platform-wide"}
            </b>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line-soft py-[7px] text-[13px]">
            <span className="text-ink-4">Credentials</span>
            <b className="inline-flex items-center gap-1 font-semibold text-ink">
              {encryptedAtRest ? (
                <>
                  <Lock className="h-3 w-3 text-ok" strokeWidth={2} />
                  Encrypted at rest
                </>
              ) : (
                "Platform env secret"
              )}
            </b>
          </div>
        </div>

        <p className="mt-3 mono text-[10.5px] uppercase tracking-[0.14em] text-ink-4">
          Connection probe
        </p>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-3">
          {hasProbe
            ? "Run a live probe against the upstream before connecting — a present key is never enough for a green badge."
            : "This service has no live probe; the status check reports its honest configured / dry-run state."}
        </p>
        {result && (
          <div className="mt-2">
            <TestResultLine result={result} />
          </div>
        )}
      </ModalBody>

      <ModalFooter
        help={
          hasProbe ? "Probe hits the upstream" : "Reports configured state"
        }
      >
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onRunTest}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <Wifi className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          <span className="ml-1">
            {hasProbe ? "Test connection" : "Check status"}
          </span>
        </button>
        {configureHref ? (
          <Link href={configureHref} className="btn btn-accent btn-sm">
            {isConnected ? "Open settings" : "Continue to connect"}
            <ArrowUpRight className="ml-1 h-4 w-4" strokeWidth={1.75} />
          </Link>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Done
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}

function TestResultLine({ result }: { result: PlatformTestResult }) {
  if (!result.ok) {
    return (
      <p className="rounded-[8px] bg-danger-weak/40 px-3 py-2 text-[12px] text-danger">
        Test failed: {result.error}
      </p>
    );
  }
  const tone =
    result.mode === "live" && result.connected
      ? "bg-success-weak/40 text-ok"
      : result.mode === "live"
        ? "bg-danger-weak/40 text-danger"
        : "bg-warning-weak/40 text-warn";
  const label =
    result.mode === "live"
      ? result.connected
        ? "Verified ✓"
        : "Live probe failed"
      : result.mode === "dry_run"
        ? "Dry-run"
        : "Not configured";
  return (
    <p className={cn("rounded-[8px] px-3 py-2 text-[12px]", tone)}>
      <span className="font-semibold">{label}</span> — {result.detail}
    </p>
  );
}
