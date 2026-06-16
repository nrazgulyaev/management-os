import "server-only";

/**
 * Stage 6.P5 — Google Workspace service layer.
 *
 * Thin orchestration sitting between server actions / cron / UI and
 * the per-service providers. Mirrors the shape of the marketing
 * service (`src/lib/marketing/service.ts`) — load active provider,
 * delegate, normalize errors, return a uniform shape.
 *
 * TENANCY: this module is an internal SERVER-ONLY library — it must
 * NOT carry a `"use server"` directive. With `"use server"` every
 * export becomes a browser-invokable RPC endpoint, so a client could
 * POST e.g. `disconnectGoogleConnection({ organizationId: "<victim>",
 * connectionId })` and disable another tenant's Google grant (a
 * cross-tenant write/DoS), or read another org's connections via
 * `listGoogleConnectionsForOrg`. The exports here trust a passed
 * `organizationId` only because every caller derives it server-side
 * (the OAuth-callback route + settings page via `requireOrgId()`, the
 * health-check cron by iterating its own org-scoped rows). The one
 * client-reachable mutation (disconnect) additionally re-derives the
 * org from the session below and is exposed to the UI exclusively
 * through the thin `"use server"` wrapper in connection-actions.ts.
 */

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { oauthConnections } from "@/lib/db/schema/bulk-import";
import { requireOrgId } from "@/features/auth/require-org";
import { requirePermission } from "@/features/auth/permissions";
import {
  selectGoogleCalendarProvider,
  selectGoogleDriveProvider,
  selectGoogleSheetsProvider,
} from "./select-provider";
import type { CalendarEventRecord } from "./calendar/parsers";
import type { DriveFileRecord } from "./drive/provider";
import type { GoogleConnectionTestResult } from "./types";
import {
  encryptCredentials,
  type EncryptedCredentialsBlob,
} from "@/lib/channel-manager/credentials-crypto";
import { stayLinkKmsSecret } from "@/lib/env";

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export async function listCalendarEventsForUser(input: {
  organizationId: string;
  userId: string;
  timeMin?: Date;
  timeMax?: Date;
  maxResults?: number;
  calendarId?: string;
}): Promise<CalendarEventRecord[]> {
  const provider = await selectGoogleCalendarProvider({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  if (!provider) return [];
  return provider.listEvents({
    calendarId: input.calendarId,
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    maxResults: input.maxResults,
  });
}

export async function createCalendarEventForUser(input: {
  organizationId: string;
  userId: string;
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  attendees?: string[];
  timeZone?: string;
  calendarId?: string;
}): Promise<CalendarEventRecord | null> {
  const provider = await selectGoogleCalendarProvider({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  if (!provider) return null;
  return provider.createEvent({
    calendarId: input.calendarId,
    summary: input.summary,
    description: input.description,
    startAt: input.startAt,
    endAt: input.endAt,
    attendees: input.attendees,
    timeZone: input.timeZone,
  });
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

export async function readSheetRangeForUser(input: {
  organizationId: string;
  userId: string;
  spreadsheetId: string;
  range: string;
}): Promise<unknown[][]> {
  const provider = await selectGoogleSheetsProvider({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  if (!provider) return [];
  return provider.readRange({
    spreadsheetId: input.spreadsheetId,
    range: input.range,
  });
}

export async function appendSheetRowsForUser(input: {
  organizationId: string;
  userId: string;
  spreadsheetId: string;
  range: string;
  values: unknown[][];
}): Promise<{ updatedRows: number }> {
  const provider = await selectGoogleSheetsProvider({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  if (!provider) return { updatedRows: 0 };
  return provider.appendRows({
    spreadsheetId: input.spreadsheetId,
    range: input.range,
    values: input.values,
  });
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

export async function listDriveFilesForUser(input: {
  organizationId: string;
  userId: string;
  q?: string;
  pageSize?: number;
}): Promise<DriveFileRecord[]> {
  const provider = await selectGoogleDriveProvider({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  if (!provider) return [];
  const result = await provider.listFiles({
    q: input.q,
    pageSize: input.pageSize,
  });
  return result.files;
}

export async function uploadDriveFileForUser(input: {
  organizationId: string;
  userId: string;
  name: string;
  mimeType: string;
  content: Uint8Array | string;
  parents?: string[];
}): Promise<DriveFileRecord | null> {
  const provider = await selectGoogleDriveProvider({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  if (!provider) return null;
  return provider.uploadFile({
    name: input.name,
    mimeType: input.mimeType,
    content: input.content,
    parents: input.parents,
  });
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

export async function listGoogleConnectionsForOrg(input?: {
  /**
   * Accepted for backwards-compat with the existing call site but NEVER
   * trusted: the org is derived from the authenticated session below so
   * a client can't enumerate another tenant's Google grants.
   */
  organizationId?: string;
}): Promise<
  Array<{
    id: string;
    userId: string;
    accountEmail: string | null;
    accountName: string | null;
    scopes: string[];
    isActive: boolean;
    lastUsedAt: Date | null;
    createdAt: Date;
  }>
> {
  void input;
  // TENANCY: derive the org from the session — do NOT trust any client-
  // supplied organizationId.
  const organizationId = await requireOrgId();
  const db = requireDb();
  const rows = await db
    .select()
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.organizationId, organizationId),
        eq(oauthConnections.provider, "google"),
      ),
    )
    .orderBy(desc(oauthConnections.createdAt));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    accountEmail: r.accountEmail,
    accountName: r.accountName,
    scopes: r.scopes ?? [],
    isActive: r.isActive,
    lastUsedAt: r.lastUsedAt,
    createdAt: r.createdAt,
  }));
}

/**
 * Persist a freshly-completed OAuth grant. Encrypts both tokens.
 * Idempotent on (organizationId, userId, provider, accountEmail) —
 * upserts via the existing unique index.
 */
export async function persistGoogleOAuthGrant(input: {
  organizationId: string;
  userId: string;
  accountEmail: string;
  accountName?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}): Promise<{ connectionId: string }> {
  const db = requireDb();
  const secret = stayLinkKmsSecret();
  if (!secret) {
    throw new Error(
      "persistGoogleOAuthGrant: STAY_LINK_KMS_SECRET is required",
    );
  }
  const accessTokenBlob: EncryptedCredentialsBlob = encryptCredentials(
    input.accessToken,
    secret,
  );
  const refreshTokenBlob: EncryptedCredentialsBlob = encryptCredentials(
    input.refreshToken,
    secret,
  );

  // Look up an existing row first for the unique-index path.
  const existing = await db
    .select({ id: oauthConnections.id })
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.organizationId, input.organizationId),
        eq(oauthConnections.userId, input.userId),
        eq(oauthConnections.provider, "google"),
        eq(oauthConnections.accountEmail, input.accountEmail),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(oauthConnections)
      .set({
        accessToken: JSON.stringify(accessTokenBlob),
        refreshToken: JSON.stringify(refreshTokenBlob),
        expiresAt: input.expiresAt,
        scopes: input.scopes,
        accountName: input.accountName ?? null,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(oauthConnections.id, existing[0].id));
    return { connectionId: existing[0].id };
  }

  const inserted = await db
    .insert(oauthConnections)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      provider: "google",
      accountEmail: input.accountEmail,
      accountName: input.accountName ?? null,
      accessToken: JSON.stringify(accessTokenBlob),
      refreshToken: JSON.stringify(refreshTokenBlob),
      expiresAt: input.expiresAt,
      scopes: input.scopes,
      isActive: true,
    })
    .returning({ id: oauthConnections.id });
  return { connectionId: inserted[0].id };
}

/**
 * Soft-disconnect a Google grant (is_active = false).
 *
 * TENANCY: the org is derived from the authenticated session via
 * `requireOrgId()` — NEVER from a client-supplied value — and the
 * UPDATE WHERE is hard-scoped by that org, so a foreign connectionId
 * is a no-op rather than a cross-tenant write. Gated by
 * `integrations.write`. Exposed to the UI through the thin
 * `"use server"` wrapper in connection-actions.ts.
 */
export async function disconnectGoogleConnection(input: {
  connectionId: string;
}): Promise<void> {
  await requirePermission("integrations.write");
  const organizationId = await requireOrgId();
  const db = requireDb();
  await db
    .update(oauthConnections)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(oauthConnections.id, input.connectionId),
        eq(oauthConnections.organizationId, organizationId),
      ),
    );
}

/**
 * Probe each user's connection — used by the hourly cron + the
 * connections-status page. Returns `null` for invalid connections so
 * the caller can mark them.
 */
export async function probeGoogleConnection(input: {
  organizationId: string;
  userId: string;
}): Promise<GoogleConnectionTestResult | null> {
  const calendar = await selectGoogleCalendarProvider(input);
  if (calendar) return calendar.testConnection();
  const sheets = await selectGoogleSheetsProvider(input);
  if (sheets) return sheets.testConnection();
  const drive = await selectGoogleDriveProvider(input);
  if (drive) return drive.testConnection();
  return null;
}
