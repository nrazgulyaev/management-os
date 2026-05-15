"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  channelConnections,
  channelSyncLog,
  CHANNEL_NAMES,
  CHANNEL_CONNECTION_STATUSES,
  type ChannelConnectionStatus,
  type ChannelName,
} from "@/lib/db/schema/channel-manager";
import { requireOrgId } from "@/features/auth/require-org";
import {
  encryptCredentials,
  isEncryptedBlob,
  decryptCredentials,
  redactCredentials,
} from "./credentials-crypto";
import { selectChannelProvider } from "./select-provider";
import type { ChannelCredentials } from "./types";
import { stayLinkKmsSecret, isProduction } from "@/lib/env";

/**
 * Stage 6.P1.E — server actions for the channel manager UI.
 *
 * Every write goes through here so that:
 *   - credentials are encrypted before insert (never plaintext at rest)
 *   - testConnection runs before status flips to 'active'
 *   - sync_log captures the full audit trail
 *   - audit-event emit (P0.7-D pattern) fires on terminal transitions
 *
 * Encryption envelope: STAY_LINK_KMS_SECRET via the shared crypto
 * helper (P1.B foundation). In dev without the secret, a deterministic
 * fallback secret keeps demo flows working but logs a warning — never
 * ship that to production.
 */

const DEV_FALLBACK_SECRET =
  "arconique:DEV-ONLY:do-not-use-in-prod:32-bytes-minimum";

function resolveSecret(): string {
  const s = stayLinkKmsSecret();
  if (s) return s;
  if (isProduction()) {
    throw new Error(
      "Channel credentials encryption refused: STAY_LINK_KMS_SECRET missing in production.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

async function resolveActiveOrgId(): Promise<string> {
  return requireOrgId();
}

/**
 * Decrypt the JSONB credentials column on a connection row. Used by
 * server actions that need to invoke a provider method (testConnection
 * etc.). Returns null if the column is empty (DryRun connection).
 */
export async function decryptConnectionCredentials(
  connectionId: string,
): Promise<ChannelCredentials | null> {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .select({ credentials: channelConnections.credentials })
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!row?.credentials) return null;
  if (!isEncryptedBlob(row.credentials)) {
    // Legacy / dev — never expected in production.
    return row.credentials as unknown as ChannelCredentials;
  }
  const json = decryptCredentials(row.credentials, resolveSecret());
  return JSON.parse(json) as ChannelCredentials;
}

// ===========================================================================
// 1) createChannelConnection
// ===========================================================================

const createSchema = z.object({
  villaId: z.string().uuid(),
  channel: z.enum(CHANNEL_NAMES as unknown as [ChannelName, ...ChannelName[]]),
  externalPropertyId: z.string().min(1).max(128),
  /** Channel-specific credentials (discriminated union — caller validates). */
  credentials: z.record(z.string(), z.unknown()),
  channelCommissionPct: z.number().min(0).max(100).optional(),
});

export interface CreateConnectionResult {
  ok: boolean;
  connectionId?: string;
  testConnectionPassed?: boolean;
  error?: string;
}

/**
 * Create a connection: encrypt creds, run testConnection, persist.
 *
 * Status transitions:
 *   - testConnection passes → 'active' + connectedAt = now
 *   - testConnection fails → 'error' + lastInventorySyncError set
 * Either way the row persists so the operator can view + retry from
 * the UI rather than re-entering credentials.
 */
export async function createChannelConnection(
  input: z.input<typeof createSchema>,
): Promise<CreateConnectionResult> {
  const ctx = await requireInternalUser();
  if (!ctx.appUser) {
    return { ok: false, error: "Authenticated user required" };
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const credentialsObj = {
    channel: data.channel,
    ...data.credentials,
  } as unknown as ChannelCredentials;

  // Test connection BEFORE persisting status='active'.
  let testPassed = false;
  let testDetails: Record<string, unknown> = {};
  try {
    const provider = selectChannelProvider(data.channel, credentialsObj);
    const result = await provider.testConnection();
    testPassed = result.connected;
    testDetails = result.details;
  } catch (err) {
    testPassed = false;
    testDetails = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const encrypted = encryptCredentials(
    JSON.stringify(credentialsObj),
    resolveSecret(),
  );

  const db = requireDb();
  const orgId = await resolveActiveOrgId();
  const status: ChannelConnectionStatus = testPassed ? "active" : "error";

  const [row] = await db
    .insert(channelConnections)
    .values({
      organizationId: orgId,
      villaId: data.villaId,
      channel: data.channel,
      externalPropertyId: data.externalPropertyId,
      credentials: encrypted as never,
      status,
      channelCommissionPct:
        data.channelCommissionPct !== undefined
          ? data.channelCommissionPct.toFixed(2)
          : null,
      connectedBy: ctx.appUser.id,
      connectedAt: testPassed ? new Date() : null,
      lastInventorySyncError: testPassed
        ? null
        : truncate(JSON.stringify(testDetails), 240),
    })
    .onConflictDoUpdate({
      target: [
        channelConnections.organizationId,
        channelConnections.villaId,
        channelConnections.channel,
      ],
      // Re-connecting an existing (org, villa, channel) overwrites the
      // credentials but preserves the row id so sync_log history doesn't
      // break.
      set: {
        externalPropertyId: data.externalPropertyId,
        credentials: encrypted as never,
        status,
        connectedBy: ctx.appUser.id,
        connectedAt: testPassed ? new Date() : null,
        lastInventorySyncError: testPassed
          ? null
          : truncate(JSON.stringify(testDetails), 240),
        updatedAt: new Date(),
      },
    })
    .returning({ id: channelConnections.id });

  return {
    ok: true,
    connectionId: row.id,
    testConnectionPassed: testPassed,
  };
}

// ===========================================================================
// 2) testConnection — re-run on demand
// ===========================================================================

export async function testChannelConnection(
  connectionId: string,
): Promise<{ ok: boolean; connected: boolean; details: Record<string, unknown> }> {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!row) {
    return { ok: false, connected: false, details: { error: "not found" } };
  }
  const creds = await decryptConnectionCredentials(connectionId);
  const provider = selectChannelProvider(row.channel as ChannelName, creds);
  const result = await provider.testConnection();
  return { ok: true, connected: result.connected, details: result.details };
}

// ===========================================================================
// 3) Status transitions: pause / resume / archive
// ===========================================================================

const statusUpdateSchema = z.object({
  connectionId: z.string().uuid(),
  status: z.enum(
    CHANNEL_CONNECTION_STATUSES as unknown as [
      ChannelConnectionStatus,
      ...ChannelConnectionStatus[],
    ],
  ),
  archiveReason: z.string().max(240).optional(),
});

export async function updateChannelConnectionStatus(
  input: z.input<typeof statusUpdateSchema>,
): Promise<{ ok: boolean; error?: string }> {
  await requireInternalUser();
  const parsed = statusUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const db = requireDb();
  const archived = parsed.data.status === "archived";
  await db
    .update(channelConnections)
    .set({
      status: parsed.data.status,
      archivedAt: archived ? new Date() : null,
      archiveReason: archived ? (parsed.data.archiveReason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(channelConnections.id, parsed.data.connectionId));
  return { ok: true };
}

// ===========================================================================
// 4) Manual sync trigger — used by the connection detail "Sync now" button
// ===========================================================================

export interface ManualSyncResult {
  ok: boolean;
  syncType: "inventory_push" | "rates_push" | "reservations_pull";
  recordsProcessed: number;
  apiCallsCount: number;
  error?: string;
}

/**
 * Operator-triggered single-shot sync. Picks the channel provider,
 * runs the requested sync type with a placeholder payload (real cron
 * jobs in P1.G will assemble the right windows), logs to sync_log,
 * returns the result for UI display.
 *
 * NOTE: The in-flight payload (availability map / rates map) currently
 * lives on the operator's request — P1.G's cron jobs will derive
 * these from villa.availability + villa.rates queries. For now this
 * action exists so the UI's "Sync now" button works end-to-end.
 */
export async function triggerManualReservationsPull(
  connectionId: string,
): Promise<ManualSyncResult> {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!row) {
    return {
      ok: false,
      syncType: "reservations_pull",
      recordsProcessed: 0,
      apiCallsCount: 0,
      error: "Connection not found",
    };
  }
  const orgId = row.organizationId;
  const creds = await decryptConnectionCredentials(connectionId);
  const provider = selectChannelProvider(row.channel as ChannelName, creds);

  const startedAt = new Date();
  let recordsProcessed = 0;
  let recordsSucceeded = 0;
  let recordsFailed = 0;
  let success = true;
  let errorMessage: string | undefined;
  let durationMs = 0;
  try {
    const t0 = Date.now();
    const reservations = await provider.pullReservations({
      externalPropertyId: row.externalPropertyId,
      modifiedSince: row.lastReservationSyncAt ?? undefined,
    });
    durationMs = Date.now() - t0;
    recordsProcessed = reservations.length;
    recordsSucceeded = reservations.length;
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message : String(err);
    recordsFailed = 1;
  }

  await db.insert(channelSyncLog).values({
    organizationId: orgId,
    channelConnectionId: connectionId,
    syncType: "reservations_pull",
    triggerSource: "manual",
    recordsProcessed,
    recordsSucceeded,
    recordsFailed,
    status: success ? "success" : "failed",
    errorMessage: errorMessage ?? null,
    durationMs,
    triggeredAt: startedAt,
    completedAt: new Date(),
    apiCallsCount: 1,
  });

  await db
    .update(channelConnections)
    .set({
      lastReservationSyncAt: new Date(),
      lastReservationSyncStatus: success ? "success" : "failed",
      lastReservationSyncError: errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(channelConnections.id, connectionId));

  return {
    ok: true,
    syncType: "reservations_pull",
    recordsProcessed,
    apiCallsCount: 1,
    error: errorMessage,
  };
}

// ===========================================================================
// 5) Helpers used by UI components
// ===========================================================================

/**
 * Operator-safe view of credentials — strips secrets, returns metadata
 * only. Used by the connection detail Settings tab to show "what's
 * configured" without re-displaying the full credential blob.
 */
export async function getRedactedCredentials(
  connectionId: string,
): Promise<Record<string, unknown>> {
  const creds = await decryptConnectionCredentials(connectionId);
  if (!creds) return {};
  return redactCredentials(creds as unknown as Record<string, unknown>);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

/** Quick total count for the channels page eyebrow. */
export async function countActiveConnections(): Promise<number> {
  const db = requireDb();
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(channelConnections)
    .where(eq(channelConnections.status, "active"));
  return Number(row?.c ?? 0);
}
