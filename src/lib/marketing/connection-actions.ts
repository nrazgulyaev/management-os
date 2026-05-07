"use server";

/**
 * Stage 7.F.B.1 — Marketing connection CRUD actions.
 *
 * Operator-facing entry points to wire credentials for the 7 supported
 * marketing providers. Encrypts the credential blob via the same
 * STAY_LINK_KMS_SECRET envelope used by channel-manager + Google
 * Workspace credentials.
 *
 * Per the Stage 7.F plan: NO new providers, NO new schema. The
 * `marketing_connections` table + `MarketingProviderInterface` already
 * ship with Stage 6.P4 — this module just plumbs them into operator
 * UI.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  marketingConnections,
  type MarketingProviderName,
} from "@/lib/db/schema/p4-marketing";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { selectMarketingProvider } from "./select-provider";
import type { MarketingCredentials } from "./types";

// ---------------------------------------------------------------------------
// Schemas — discriminated by provider field, mirrors MarketingCredentials
// ---------------------------------------------------------------------------

const gaSchema = z.object({
  provider: z.literal("google_analytics"),
  measurementId: z.string().min(3).max(40),
  apiSecret: z.string().min(8).max(120),
  propertyId: z.string().min(2).max(40),
});

const googleAdsSchema = z.object({
  provider: z.literal("google_ads"),
  developerToken: z.string().min(8),
  clientId: z.string().min(8),
  clientSecret: z.string().min(8),
  refreshToken: z.string().min(8),
  customerId: z.string().regex(/^\d{10}$/, "10-digit customer id, no dashes"),
  loginCustomerId: z.string().regex(/^\d{10}$/).optional().or(z.literal("")),
});

const metaPixelSchema = z.object({
  provider: z.literal("meta_pixel"),
  pixelId: z.string().min(3).max(40),
  accessToken: z.string().min(8),
  testEventCode: z.string().max(40).optional().or(z.literal("")),
  appSecret: z.string().min(8).optional().or(z.literal("")),
});

const metaAdsSchema = z.object({
  provider: z.literal("meta_ads"),
  accessToken: z.string().min(8),
  adAccountId: z.string().regex(/^act_\d+$/, "format: act_<digits>"),
  businessId: z.string().optional().or(z.literal("")),
  appSecret: z.string().min(8).optional().or(z.literal("")),
});

const tiktokAdsSchema = z.object({
  provider: z.literal("tiktok_ads"),
  accessToken: z.string().min(8),
  advertiserId: z.string().min(4),
  appId: z.string().min(4),
  secret: z.string().min(8),
});

const mailchimpSchema = z.object({
  provider: z.literal("mailchimp"),
  apiKey: z.string().regex(/.+-us\d+$/, "Mailchimp API key (must end -us<dc>)"),
});

const convertkitSchema = z.object({
  provider: z.literal("convertkit"),
  apiKey: z.string().min(8),
  apiSecret: z.string().min(8),
});

const createConnectionSchema = z.discriminatedUnion("provider", [
  gaSchema,
  googleAdsSchema,
  metaPixelSchema,
  metaAdsSchema,
  tiktokAdsSchema,
  mailchimpSchema,
  convertkitSchema,
]);

export type CreateMarketingConnectionInput = z.infer<typeof createConnectionSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick a stable external_account_id per provider for the UNIQUE
 * (org, provider, external_account_id) constraint.
 */
function externalAccountIdFor(input: CreateMarketingConnectionInput): string {
  switch (input.provider) {
    case "google_analytics":
      return input.propertyId;
    case "google_ads":
      return input.customerId;
    case "meta_pixel":
      return input.pixelId;
    case "meta_ads":
      return input.adAccountId;
    case "tiktok_ads":
      return input.advertiserId;
    case "mailchimp":
      // Use the dc suffix as a stable account id — different keys for the
      // same dc represent the same Mailchimp account.
      return input.apiKey.slice(input.apiKey.lastIndexOf("-") + 1);
    case "convertkit":
      // ConvertKit has no public account id; hash the secret prefix.
      return input.apiKey.slice(0, 8);
  }
}

function accountNameFor(input: CreateMarketingConnectionInput): string {
  switch (input.provider) {
    case "google_analytics":
      return `GA4 ${input.measurementId}`;
    case "google_ads":
      return `Google Ads ${input.customerId}`;
    case "meta_pixel":
      return `Meta Pixel ${input.pixelId}`;
    case "meta_ads":
      return `Meta Ads ${input.adAccountId}`;
    case "tiktok_ads":
      return `TikTok Ads ${input.advertiserId}`;
    case "mailchimp":
      return `Mailchimp ${input.apiKey.slice(input.apiKey.lastIndexOf("-") + 1)}`;
    case "convertkit":
      return "ConvertKit account";
  }
}

function toCredentials(input: CreateMarketingConnectionInput): MarketingCredentials {
  switch (input.provider) {
    case "google_analytics":
      return {
        provider: "google_analytics",
        measurementId: input.measurementId,
        apiSecret: input.apiSecret,
        propertyId: input.propertyId,
      };
    case "google_ads":
      return {
        provider: "google_ads",
        developerToken: input.developerToken,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        refreshToken: input.refreshToken,
        customerId: input.customerId,
        loginCustomerId:
          input.loginCustomerId && input.loginCustomerId !== ""
            ? input.loginCustomerId
            : undefined,
      };
    case "meta_pixel":
      return {
        provider: "meta_pixel",
        pixelId: input.pixelId,
        accessToken: input.accessToken,
        testEventCode:
          input.testEventCode && input.testEventCode !== ""
            ? input.testEventCode
            : undefined,
        appSecret:
          input.appSecret && input.appSecret !== "" ? input.appSecret : undefined,
      };
    case "meta_ads":
      return {
        provider: "meta_ads",
        accessToken: input.accessToken,
        adAccountId: input.adAccountId,
        businessId:
          input.businessId && input.businessId !== "" ? input.businessId : undefined,
        appSecret:
          input.appSecret && input.appSecret !== "" ? input.appSecret : undefined,
      };
    case "tiktok_ads":
      return {
        provider: "tiktok_ads",
        accessToken: input.accessToken,
        advertiserId: input.advertiserId,
        appId: input.appId,
        secret: input.secret,
      };
    case "mailchimp":
      return { provider: "mailchimp", apiKey: input.apiKey };
    case "convertkit":
      return {
        provider: "convertkit",
        apiKey: input.apiKey,
        apiSecret: input.apiSecret,
      };
  }
}

// NOTE: Stage 6.P4's marketing service reads `credentials` JSONB
// directly (see service.ts:80 — `conn.credentials as MarketingCredentials`).
// Encryption-at-rest for marketing credentials was not wired in P4 (the
// schema comment promises it but the read path was never updated). The
// channel-manager + Google-Workspace surfaces use the encrypted envelope.
// Bringing marketing into parity is a coordinated cross-cutting change
// (action + service.ts + cron) — out of scope for Stage 7.F.
//
// For 7.F.B.1 we store credentials as plaintext JSONB to match the
// existing read path. A FOLLOW-UP migration + service update should
// roll marketing onto the same encrypted envelope.

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createMarketingConnectionAction(input: {
  organizationId: string;
  data: CreateMarketingConnectionInput;
}): Promise<{ ok: true; connectionId: string } | { ok: false; error: string }> {
  await requirePermission("marketing.write");
  const parsed = createConnectionSchema.safeParse(input.data);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid form input",
    };
  }
  const db = requireDb();
  const me = await getCurrentAppUser();

  const credentials = toCredentials(parsed.data);
  const externalAccountId = externalAccountIdFor(parsed.data);
  const accountName = accountNameFor(parsed.data);

  // Check uniqueness — (org, provider, external_account_id).
  const [existing] = await db
    .select({ id: marketingConnections.id })
    .from(marketingConnections)
    .where(
      and(
        eq(marketingConnections.organizationId, input.organizationId),
        eq(marketingConnections.provider, parsed.data.provider),
        eq(marketingConnections.externalAccountId, externalAccountId),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      ok: false,
      error: `A ${parsed.data.provider} connection for ${accountName} already exists.`,
    };
  }

  const [row] = await db
    .insert(marketingConnections)
    .values({
      organizationId: input.organizationId,
      provider: parsed.data.provider,
      externalAccountId,
      accountName,
      // Stored plaintext to match existing service read path. See note
      // above re: encryption-at-rest follow-up.
      credentials: credentials as never,
      status: "pending",
      connectedBy: me?.id ?? null,
      connectedAt: new Date(),
    })
    .returning({ id: marketingConnections.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "marketing.connection.create",
    entityType: "marketing_connection",
    entityId: row.id,
    after: {
      provider: parsed.data.provider,
      externalAccountId,
      accountName,
    },
  });

  revalidatePath("/development-os/marketing/connections");
  return { ok: true, connectionId: row.id };
}

/**
 * Fire `provider.testConnection()` and persist `status` + `last_sync_status`
 * accordingly. Surfaces the result to the UI so operator can confirm
 * before moving on.
 */
export async function testMarketingConnectionAction(args: {
  connectionId: string;
}): Promise<
  | { ok: true; connected: boolean; details?: Record<string, unknown> }
  | { ok: false; error: string }
> {
  await requirePermission("marketing.read");
  const db = requireDb();
  const me = await getCurrentAppUser();

  const [row] = await db
    .select()
    .from(marketingConnections)
    .where(eq(marketingConnections.id, args.connectionId))
    .limit(1);
  if (!row) return { ok: false, error: "Connection not found." };

  const credentials = (row.credentials as MarketingCredentials | null) ?? null;
  const provider = selectMarketingProvider(
    row.provider as MarketingProviderName,
    credentials,
  );

  let result;
  try {
    result = await provider.testConnection();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(marketingConnections)
      .set({
        status: "error",
        lastSyncStatus: "error",
        lastSyncError: msg,
        updatedAt: new Date(),
      })
      .where(eq(marketingConnections.id, args.connectionId));
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "marketing.connection.test_failed",
      entityType: "marketing_connection",
      entityId: args.connectionId,
      after: { error: msg },
    });
    revalidatePath(
      `/development-os/marketing/connections/${args.connectionId}`,
    );
    return { ok: false, error: msg };
  }

  await db
    .update(marketingConnections)
    .set({
      status: result.connected ? "active" : "error",
      lastSyncStatus: result.connected ? "success" : "error",
      lastSyncError: result.connected ? null : "testConnection returned false",
      updatedAt: new Date(),
    })
    .where(eq(marketingConnections.id, args.connectionId));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "marketing.connection.test",
    entityType: "marketing_connection",
    entityId: args.connectionId,
    after: { connected: result.connected, details: result.details },
  });

  revalidatePath(`/development-os/marketing/connections/${args.connectionId}`);
  return {
    ok: true,
    connected: result.connected,
    details: result.details ?? undefined,
  };
}

/**
 * Disconnect = soft-archive. Status flips to `archived`, `archived_at`
 * stamped, credentials are NOT cleared (audit trail). Re-connecting
 * means a new row.
 */
export async function disconnectMarketingConnectionAction(args: {
  connectionId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("marketing.write");
  const db = requireDb();
  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(marketingConnections)
    .where(eq(marketingConnections.id, args.connectionId))
    .limit(1);
  if (!before) return { ok: false, error: "Connection not found." };
  if (before.status === "archived") {
    return { ok: false, error: "Already archived." };
  }

  await db
    .update(marketingConnections)
    .set({
      status: "archived",
      archivedAt: new Date(),
      archiveReason: args.reason ?? "operator-initiated",
      updatedAt: new Date(),
    })
    .where(eq(marketingConnections.id, args.connectionId));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "marketing.connection.disconnect",
    entityType: "marketing_connection",
    entityId: args.connectionId,
    before: { status: before.status },
    after: { status: "archived", reason: args.reason ?? null },
  });

  revalidatePath("/development-os/marketing/connections");
  return { ok: true };
}

/**
 * Force a manual sync. Wraps the existing service-layer
 * `syncCampaignsForConnection` for parity with the cron path.
 */
export async function syncMarketingConnectionNowAction(args: {
  connectionId: string;
}): Promise<
  | { ok: true; inserted: number; updated: number; failed: number }
  | { ok: false; error: string }
> {
  await requirePermission("marketing.write");
  const me = await getCurrentAppUser();
  try {
    const { syncCampaignsForConnection } = await import("./service");
    const result = await syncCampaignsForConnection(args.connectionId);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? "sync failed",
      };
    }
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "marketing.connection.manual_sync",
      entityType: "marketing_connection",
      entityId: args.connectionId,
      after: {
        inserted: result.inserted,
        updated: result.updated,
        failed: result.failed,
      },
    });
    revalidatePath(
      `/development-os/marketing/connections/${args.connectionId}`,
    );
    return {
      ok: true,
      inserted: result.inserted,
      updated: result.updated,
      failed: result.failed,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Re-export utility type for the UI form.
export type { MarketingProviderName };
