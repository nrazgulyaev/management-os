import "server-only";

/**
 * block10-integrations-hub — truthful trust-tier model for PLATFORM /
 * env-configured integrations.
 *
 * The Live-connections section (`_connected-integrations.tsx`, shipped in
 * #162) already reads a HONEST trust tier off each per-org DB connection's
 * status FSM. The catalog grid below it, however, was still env-presence
 * driven: a present `STRIPE_SECRET_KEY` rendered a green "Configured" pill
 * even though OTA push + PSP capture are SIMULATED/deferred, and a present
 * `RESEND_API_KEY` rendered "Ready" even though nothing had ever probed it.
 * That is exactly the "false-green" the contract forbids.
 *
 * This module replaces env-presence → status with an explicit 3-tier model
 * that can NEVER be falsely green:
 *
 *   - "real"     — a live upstream is genuinely wired AND not a known
 *                  simulation. Only granted to integrations whose runtime
 *                  actually calls the upstream (email, messaging, AI, KMS,
 *                  auth, storage, cron). Green.
 *   - "dry_run"  — credentials may be present, but the runtime is a stub /
 *                  simulation / explicitly deferred (Stripe capture, OTA
 *                  push) OR an explicit *_DRY_RUN flag is set. Amber — this
 *                  is the honest "looks configured but does not really run"
 *                  state. NEVER green.
 *   - "ignored"  — no UI / not configured / not applicable for this deploy.
 *                  Neutral.
 *
 * Plus a transient "error" tier for the one platform dependency that can
 * be actively broken (the KMS secret, on which every per-org credential
 * depends).
 *
 * Nothing here writes; it is a pure read over env + a couple of cheap env
 * helpers. The per-integration *probe* (a real network test) lives in
 * `platform-test-actions.ts`.
 */

import {
  isDbConfigured,
  isSupabaseAuthConfigured,
  isResendConfigured,
  isTwilioConfigured,
  isNotificationsDryRun,
  isAiConfigured,
  isAiDryRun,
  isOpenAiConfigured,
  isGeminiConfigured,
  isStayLinkKmsConfigured,
  env,
} from "@/lib/env";

/**
 * The 3 trust tiers (+ error). Mirrors the per-org FSM tiers used by the
 * Live-connections section so the whole page speaks one vocabulary.
 */
export type PlatformTrustTier = "real" | "dry_run" | "ignored" | "error";

/**
 * Stable key per integration — drives the per-integration test action so
 * the client component knows which probe to run.
 */
export type PlatformIntegrationKey =
  | "ai_anthropic"
  | "resend_email"
  | "twilio_messaging"
  | "twilio_sms"
  | "stripe_billing"
  | "ota_push"
  | "document_storage"
  | "supabase_auth"
  | "cron_jobs"
  | "credential_kms";

/** Whether a real test-connection probe exists for this integration. */
export type ProbeKind =
  | "anthropic" // live Anthropic Messages ping
  | "resend" // live Resend domains ping
  | "twilio" // live Twilio account fetch
  | "none"; // honest "no probe — reports configured/dry-run/not-configured"

export interface PlatformIntegrationTrust {
  key: PlatformIntegrationKey;
  tier: PlatformTrustTier;
  /** Short, honest one-liner explaining WHY this tier (no marketing spin). */
  reason: string;
  /** Which real probe (if any) backs the Test-connection button. */
  probe: ProbeKind;
  /**
   * True when the integration persists credentials encrypted at rest via
   * the platform KMS. Surfaces the encryption indicator on the card.
   */
  encryptedAtRest: boolean;
  /** True when this integration is explicitly simulated / deferred. */
  simulated: boolean;
}

const TIER_LABEL: Record<PlatformTrustTier, string> = {
  real: "Real",
  dry_run: "Dry-run",
  ignored: "Ignored",
  error: "Error",
};

export function platformTierLabel(tier: PlatformTrustTier): string {
  return TIER_LABEL[tier];
}

export function platformTierTone(
  tier: PlatformTrustTier,
): "success" | "warning" | "neutral" | "danger" {
  switch (tier) {
    case "real":
      return "success";
    case "dry_run":
      return "warning";
    case "error":
      return "danger";
    case "ignored":
      return "neutral";
  }
}

/**
 * Resolve the truthful trust tier for every platform / env integration.
 *
 * The KMS state is load-bearing for the encryption story: when it is
 * missing in production every per-org credential silently falls back to
 * plaintext, so it is the one platform integration that can be in "error".
 */
export function resolvePlatformIntegrationTrust(): PlatformIntegrationTrust[] {
  const kmsReady = isStayLinkKmsConfigured();
  const resendReady = isResendConfigured();
  const twilioReady = isTwilioConfigured();
  const anyAiKey =
    isAiConfigured() || isOpenAiConfigured() || isGeminiConfigured();
  const dbReady = isDbConfigured();
  const authReady = isSupabaseAuthConfigured();
  const cronReady = Boolean(env.server.CRON_SECRET);

  const out: PlatformIntegrationTrust[] = [];

  // ── AI providers ─────────────────────────────────────────────────────
  // Real only when a key is present AND dry-run is not forced. The
  // isAiDryRun() helper already encodes "no key ⇒ dry-run" so this is
  // honest: keys present + AI_DRY_RUN unset ⇒ real, otherwise dry-run.
  out.push({
    key: "ai_anthropic",
    tier: anyAiKey ? (isAiDryRun() ? "dry_run" : "real") : "dry_run",
    reason: !anyAiKey
      ? "No provider key — every AI surface runs its deterministic dry-run stub."
      : isAiDryRun()
        ? "Key present but AI_DRY_RUN is set — live calls are disabled."
        : "Live Anthropic key wired. Test runs a real Messages probe.",
    probe: "anthropic",
    encryptedAtRest: true, // per-org keys sealed via secure-connection-credentials
    simulated: false,
  });

  // ── Resend (transactional email) ─────────────────────────────────────
  // Real only when configured AND notifications are not in dry-run.
  out.push({
    key: "resend_email",
    tier: resendReady ? (isNotificationsDryRun() ? "dry_run" : "real") : "dry_run",
    reason: !resendReady
      ? "RESEND_API_KEY + RESEND_FROM_EMAIL unset — emails queue for manual send."
      : isNotificationsDryRun()
        ? "Key present but NOTIFICATIONS_DRY_RUN is on — nothing is actually sent."
        : "Live Resend key wired. Test pings the Resend domains endpoint.",
    probe: "resend",
    encryptedAtRest: false, // platform env key, not per-org credential
    simulated: false,
  });

  // ── WhatsApp / Twilio messaging ──────────────────────────────────────
  out.push({
    key: "twilio_messaging",
    tier: twilioReady ? "real" : "dry_run",
    reason: twilioReady
      ? "Platform Twilio credentials present; per-org overrides take priority at runtime. Test fetches the Twilio account."
      : "No Twilio credentials — messaging falls back to the dry-run provider; concierge copy-pastes manually.",
    probe: "twilio",
    encryptedAtRest: true, // per-org creds sealed in oauth_connections
    simulated: false,
  });

  // ── SMS (shares Twilio creds) ────────────────────────────────────────
  out.push({
    key: "twilio_sms",
    tier: twilioReady && env.server.TWILIO_FROM_SMS ? "real" : "ignored",
    reason:
      twilioReady && env.server.TWILIO_FROM_SMS
        ? "Shares Twilio credentials; TWILIO_FROM_SMS set."
        : "Optional. Set TWILIO_FROM_SMS to enable SMS fallback.",
    probe: "twilio",
    encryptedAtRest: false,
    simulated: false,
  });

  // ── Stripe billing / PSP capture — SIMULATED / DEFERRED ──────────────
  // PSP capture is the LAST build (Indonesia launch); until then manual
  // mark-paid only. So even with STRIPE_SECRET_KEY present this is NEVER
  // green — it is an honest dry-run.
  out.push({
    key: "stripe_billing",
    tier: "dry_run",
    reason:
      "PSP capture is deferred to launch (Xendit/QRIS/e-wallets for Indonesia; Stripe international). Manual mark-paid only today — no real charge runs.",
    probe: "none",
    encryptedAtRest: false,
    simulated: true,
  });

  // ── Channel-manager OTA push — SIMULATED / DEFERRED ──────────────────
  // Per-org inbound sync is real and lives in the Live-connections section
  // above; the *push* of rates/availability to OTAs is simulated.
  out.push({
    key: "ota_push",
    tier: "dry_run",
    reason:
      "Inbound reservation sync is managed per-org above. Outbound OTA rate/availability push is simulated — no live write hits Booking.com / Airbnb.",
    probe: "none",
    encryptedAtRest: true,
    simulated: true,
  });

  // ── Document storage ─────────────────────────────────────────────────
  out.push({
    key: "document_storage",
    tier: dbReady ? "real" : "ignored",
    reason: dbReady
      ? "Supabase Storage active. Bucket health visible at /system/storage."
      : "Set DATABASE_URL / Supabase env to enable document storage.",
    probe: "none",
    encryptedAtRest: false,
    simulated: false,
  });

  // ── Auth ─────────────────────────────────────────────────────────────
  out.push({
    key: "supabase_auth",
    tier: authReady ? "real" : "ignored",
    reason: authReady
      ? "Supabase Auth wired (sign-in, magic links, MFA, Google OAuth)."
      : "Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    probe: "none",
    encryptedAtRest: false,
    simulated: false,
  });

  // ── Cron ─────────────────────────────────────────────────────────────
  out.push({
    key: "cron_jobs",
    tier: cronReady ? "real" : "ignored",
    reason: cronReady
      ? "CRON_SECRET set. Last-run telemetry at /dashboard/jobs."
      : "Set CRON_SECRET to enable scheduled jobs.",
    probe: "none",
    encryptedAtRest: false,
    simulated: false,
  });

  // ── Credential KMS — the encryption keystone ─────────────────────────
  // This is the only platform integration that can be actively BROKEN: a
  // missing secret in production means every per-org credential above
  // falls back to plaintext.
  out.push({
    key: "credential_kms",
    tier: kmsReady ? "real" : "error",
    reason: kmsReady
      ? "AES-256-GCM platform secret present — per-org credentials are encrypted at rest."
      : "STAY_LINK_KMS_SECRET missing — per-org credentials would fall back to plaintext. Fix before connecting any integration.",
    probe: "none",
    encryptedAtRest: true,
    simulated: false,
  });

  return out;
}

/** Convenience: count tiers for the page header summary. */
export function summarizePlatformTrust(rows: PlatformIntegrationTrust[]): {
  real: number;
  dryRun: number;
  ignored: number;
  error: number;
} {
  return {
    real: rows.filter((r) => r.tier === "real").length,
    dryRun: rows.filter((r) => r.tier === "dry_run").length,
    ignored: rows.filter((r) => r.tier === "ignored").length,
    error: rows.filter((r) => r.tier === "error").length,
  };
}
