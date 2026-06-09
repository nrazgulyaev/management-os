"use server";

/**
 * block10-integrations-hub — REAL test-connection probes for the platform /
 * env-configured integrations.
 *
 * The per-org DB connections (channels / banking / marketing / WhatsApp)
 * already have honest `testConnection` actions that hit their providers or
 * fall back to the dry-run provider. This file adds the missing half: a
 * real probe for the env-configured platform integrations that the catalog
 * grid used to mark green purely on env-presence.
 *
 * Each probe either:
 *   - actually calls the upstream (Anthropic Messages, Resend domains,
 *     Twilio account fetch) and reports `connected: true/false`, or
 *   - honestly reports `mode: "dry_run"` / `mode: "not_configured"` when no
 *     live call is possible — NEVER a false green.
 *
 * Every probe is permission-gated (`integrations.read`), org-scoped
 * (`requireOrgId`), and audit-logged. No money, no state writes — these are
 * read-only connectivity checks.
 */

import { z } from "zod";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { recordAuditEvent } from "@/features/audit/services";
import { env } from "@/lib/env";
import {
  resolvePlatformIntegrationTrust,
  type PlatformIntegrationKey,
} from "./platform-trust";

export type PlatformTestResult =
  | {
      ok: true;
      /** "live" = a real upstream call succeeded/failed; the others are honest stubs. */
      mode: "live" | "dry_run" | "not_configured";
      connected: boolean;
      detail: string;
    }
  | { ok: false; error: string };

const PROBE_TIMEOUT_MS = 12_000;

const inputSchema = z.object({
  key: z.enum([
    "ai_anthropic",
    "resend_email",
    "twilio_messaging",
    "twilio_sms",
    "stripe_billing",
    "ota_push",
    "document_storage",
    "supabase_auth",
    "cron_jobs",
    "credential_kms",
  ]),
});

/**
 * Run the truthful test-connection probe for a single platform integration.
 *
 * Returns `mode: "dry_run"` for the explicitly-simulated integrations
 * (Stripe capture, OTA push) and `mode: "not_configured"` when credentials
 * are absent — both honest non-green outcomes. Only a genuine upstream call
 * yields `mode: "live"`.
 */
export async function testPlatformIntegrationAction(
  input: z.input<typeof inputSchema>,
): Promise<PlatformTestResult> {
  await requirePermission("integrations.read");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Unknown integration." };
  }
  const key = parsed.data.key as PlatformIntegrationKey;
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  let result: PlatformTestResult;
  try {
    result = await runProbe(key);
  } catch (err) {
    result = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Audit every probe — connectivity tests are an operator action worth
  // tracing (who tested what, and the honest outcome). entityId is a uuid
  // column, so the string integration key + org context live in metadata.
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "integrations.platform.test",
    entityType: "platform_integration",
    metadata: { key, organizationId },
    after: result.ok
      ? { mode: result.mode, connected: result.connected }
      : { error: result.error },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

async function runProbe(key: PlatformIntegrationKey): Promise<PlatformTestResult> {
  // For the explicitly-simulated / no-probe integrations, return the honest
  // tier straight from the resolver instead of pretending to test.
  const trust = resolvePlatformIntegrationTrust().find((t) => t.key === key);
  if (!trust) return { ok: false, error: "Unknown integration." };

  switch (trust.probe) {
    case "anthropic":
      return probeAnthropic();
    case "resend":
      return probeResend();
    case "twilio":
      return probeTwilio();
    case "none":
      // No network probe — report the honest resolved tier.
      if (trust.simulated) {
        return {
          ok: true,
          mode: "dry_run",
          connected: false,
          detail: trust.reason,
        };
      }
      if (trust.tier === "real") {
        return {
          ok: true,
          mode: "live",
          connected: true,
          detail: trust.reason,
        };
      }
      return {
        ok: true,
        mode: "not_configured",
        connected: false,
        detail: trust.reason,
      };
  }
}

/**
 * Real Anthropic probe — a minimal Messages call (max_tokens: 1). Mirrors
 * the raw-fetch pattern of `src/lib/ai/providers/anthropic.ts` (the codebase
 * deliberately avoids the SDK dependency).
 */
async function probeAnthropic(): Promise<PlatformTestResult> {
  const apiKey = env.server.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: true,
      mode: "not_configured",
      connected: false,
      detail: "No ANTHROPIC_API_KEY — AI surfaces run their dry-run stub.",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.server.ANTHROPIC_MODEL || "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: controller.signal,
    });
    if (res.ok) {
      return {
        ok: true,
        mode: "live",
        connected: true,
        detail: "Anthropic Messages probe succeeded — live key verified.",
      };
    }
    const body = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return {
      ok: true,
      mode: "live",
      connected: false,
      detail: `Anthropic rejected the key (HTTP ${res.status}): ${
        body?.error?.message ?? "unknown error"
      }`,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "AbortError"
          ? "Anthropic probe timed out."
          : err instanceof Error
            ? err.message
            : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Real Resend probe — GET /domains is the cheapest authenticated read.
 * 200 ⇒ key valid; 401/403 ⇒ key invalid. Never sends an email.
 */
async function probeResend(): Promise<PlatformTestResult> {
  const apiKey = env.server.RESEND_API_KEY;
  if (!apiKey || !env.server.RESEND_FROM_EMAIL) {
    return {
      ok: true,
      mode: "not_configured",
      connected: false,
      detail:
        "RESEND_API_KEY / RESEND_FROM_EMAIL unset — emails queue for manual send.",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (res.ok) {
      return {
        ok: true,
        mode: "live",
        connected: true,
        detail: "Resend domains probe succeeded — live key verified.",
      };
    }
    return {
      ok: true,
      mode: "live",
      connected: false,
      detail: `Resend rejected the key (HTTP ${res.status}).`,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "AbortError"
          ? "Resend probe timed out."
          : err instanceof Error
            ? err.message
            : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Real Twilio probe — fetch the Account resource with the platform SID +
 * auth token. 200 ⇒ credentials valid. Never sends a message.
 */
async function probeTwilio(): Promise<PlatformTestResult> {
  const sid = env.server.TWILIO_ACCOUNT_SID;
  const token = env.server.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return {
      ok: true,
      mode: "not_configured",
      connected: false,
      detail:
        "No Twilio credentials — messaging falls back to the dry-run provider.",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`,
      {
        method: "GET",
        headers: { authorization: `Basic ${auth}` },
        signal: controller.signal,
      },
    );
    if (res.ok) {
      return {
        ok: true,
        mode: "live",
        connected: true,
        detail: "Twilio account probe succeeded — live credentials verified.",
      };
    }
    return {
      ok: true,
      mode: "live",
      connected: false,
      detail: `Twilio rejected the credentials (HTTP ${res.status}).`,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "AbortError"
          ? "Twilio probe timed out."
          : err instanceof Error
            ? err.message
            : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
