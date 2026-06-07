import "server-only";

/**
 * Trust batch #3 — per-org WhatsApp credential resolution.
 *
 * Operators save their Twilio WhatsApp credentials per organization via
 * `saveWhatsappCredentialsAction` (encrypted into an `oauth_connections`
 * row, `provider='twilio_whatsapp'`). Previously the runtime ignored
 * those rows entirely — `getWhatsAppProvider()` read only process env, so
 * "connecting" WhatsApp in the UI was a silent no-op.
 *
 * This module closes that gap: it decrypts the saved per-org credentials
 * and builds a Twilio provider from them, falling back to the env-based
 * provider when no active row exists (or the secret/decryption is
 * unavailable). The fallback keeps every existing env-configured deploy
 * working unchanged.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { oauthConnections } from "@/lib/db/schema/bulk-import";
import { stayLinkKmsSecret } from "@/lib/env";
import {
  decryptCredentials,
  isEncryptedBlob,
  type EncryptedCredentialsBlob,
} from "@/lib/channel-manager/credentials-crypto";
import { getWhatsAppProvider } from "./providers";
import { TwilioWhatsAppProvider } from "./providers/twilio";
import { DryRunWhatsAppProvider } from "./providers/dry-run";
import { MetaCloudWhatsAppProvider } from "./providers/meta-cloud";
import type { WhatsAppProvider } from "./providers/types";

export interface OrgWhatsAppCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

/**
 * Load + decrypt the active Twilio WhatsApp credentials for an org.
 * Returns null when no active row exists, the platform secret is unset,
 * or the stored blob can't be decrypted/parsed — every failure mode
 * degrades to "no per-org creds" so the caller falls back to env.
 */
export async function loadOrgWhatsAppCredentials(
  organizationId: string,
): Promise<OrgWhatsAppCredentials | null> {
  const db = getDb();
  if (!db) return null;
  const secret = stayLinkKmsSecret();
  if (!secret) return null;

  const [row] = await db
    .select({
      accessToken: oauthConnections.accessToken,
      accountName: oauthConnections.accountName,
    })
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.organizationId, organizationId),
        eq(oauthConnections.provider, "twilio_whatsapp"),
        eq(oauthConnections.isActive, true),
      ),
    )
    .orderBy(desc(oauthConnections.updatedAt))
    .limit(1);

  if (!row?.accessToken) return null;

  try {
    const envelope = JSON.parse(row.accessToken) as EncryptedCredentialsBlob;
    if (!isEncryptedBlob(envelope)) return null;
    const bundleJson = decryptCredentials(envelope, secret);
    const bundle = JSON.parse(bundleJson) as {
      twilioAccountSid?: string;
      twilioAuthToken?: string;
      whatsappFromNumber?: string;
    };
    if (
      !bundle.twilioAccountSid ||
      !bundle.twilioAuthToken ||
      !bundle.whatsappFromNumber
    ) {
      return null;
    }
    return {
      accountSid: bundle.twilioAccountSid,
      authToken: bundle.twilioAuthToken,
      fromNumber: bundle.whatsappFromNumber,
    };
  } catch {
    // Never leak the failure mode — treat as "no creds".
    return null;
  }
}

/**
 * Resolve the WhatsApp provider for a given org: saved per-org Twilio
 * credentials take priority, otherwise the env-based runtime provider.
 *
 * A forced `WHATSAPP_PROVIDER=dry_run|meta_cloud` still wins (useful for
 * tests / staging) — those modes shouldn't be overridden by stored creds.
 */
export async function getWhatsAppProviderForOrg(
  organizationId: string,
): Promise<WhatsAppProvider> {
  const explicit = process.env.WHATSAPP_PROVIDER;
  if (explicit === "dry_run") return new DryRunWhatsAppProvider();
  if (explicit === "meta_cloud") return new MetaCloudWhatsAppProvider();

  const creds = await loadOrgWhatsAppCredentials(organizationId);
  if (creds) {
    const twilio = new TwilioWhatsAppProvider(creds);
    if (twilio.isAvailable()) return twilio;
  }
  return getWhatsAppProvider();
}
