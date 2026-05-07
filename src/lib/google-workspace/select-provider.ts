import "server-only";

/**
 * Stage 6.P5 — Google Workspace provider selector.
 *
 * One selector per service. Each selector:
 *   1. Loads + decrypts the row from `oauth_connections` for the
 *      requested (org, user, "google", account email).
 *   2. Verifies the right scopes are present.
 *   3. Returns the live provider — or null when the connection is
 *      missing / inactive / unscoped (caller falls back to dry-run
 *      or refuses the operation).
 *
 * Same shape as the AI / channel-manager / messaging / banking /
 * marketing selectors. DryRun fallback is at the *caller* layer
 * (workflow code), not here — Google Workspace surfaces are
 * inherently per-user and per-account.
 */

import { and, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { oauthConnections } from "@/lib/db/schema/bulk-import";
import {
  googleWorkspaceOAuthClientId,
  googleWorkspaceOAuthClientSecret,
  isGoogleWorkspaceConfigured,
  stayLinkKmsSecret,
} from "@/lib/env";
import {
  decryptCredentials,
  encryptCredentials,
  type EncryptedCredentialsBlob,
} from "@/lib/channel-manager/credentials-crypto";
import { GoogleCalendarProvider } from "./calendar/provider";
import { GoogleSheetsProvider } from "./sheets/provider";
import { GoogleDriveProvider } from "./drive/provider";
import {
  GOOGLE_WORKSPACE_SCOPES,
  type GoogleCalendarCredentials,
  type GoogleDriveCredentials,
  type GoogleSheetsCredentials,
  type GoogleWorkspaceService,
  type GoogleCredentialsUpdate,
} from "./types";

export interface SelectGoogleProviderInput {
  organizationId: string;
  userId: string;
  /** Optional — defaults to the most-recent active connection for this user. */
  accountEmail?: string;
}

/**
 * Internal — load + decrypt the latest active oauth_connections row.
 */
async function loadActiveConnection(input: SelectGoogleProviderInput): Promise<{
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  accountEmail: string;
} | null> {
  const db = requireDb();
  const conds = [
    eq(oauthConnections.organizationId, input.organizationId),
    eq(oauthConnections.userId, input.userId),
    eq(oauthConnections.provider, "google"),
    eq(oauthConnections.isActive, true),
  ];
  if (input.accountEmail) {
    conds.push(eq(oauthConnections.accountEmail, input.accountEmail));
  }
  const rows = await db
    .select()
    .from(oauthConnections)
    .where(and(...conds))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  // Tokens are encrypted via the same KMS envelope as channel-manager
  // connections (`STAY_LINK_KMS_SECRET`). The text columns hold a
  // JSON-stringified `EncryptedCredentialsBlob`.
  const secret = stayLinkKmsSecret();
  if (!secret) return null;
  let accessToken: string;
  let refreshToken = "";
  try {
    accessToken = decryptCredentials(
      JSON.parse(row.accessToken) as EncryptedCredentialsBlob,
      secret,
    );
    if (row.refreshToken) {
      refreshToken = decryptCredentials(
        JSON.parse(row.refreshToken) as EncryptedCredentialsBlob,
        secret,
      );
    }
  } catch {
    // Ciphertext tampered or wrong key — fail closed.
    return null;
  }

  return {
    connectionId: row.id,
    accessToken,
    refreshToken,
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : 0,
    scopes: row.scopes ?? [],
    accountEmail: row.accountEmail ?? "",
  };
}

/**
 * Persist refreshed tokens back to the row. Called via the client
 * `onCredentialsRefreshed` hook.
 */
async function persistRefresh(
  connectionId: string,
  next: GoogleCredentialsUpdate,
): Promise<void> {
  const db = requireDb();
  const secret = stayLinkKmsSecret();
  if (!secret) return;
  await db
    .update(oauthConnections)
    .set({
      accessToken: JSON.stringify(encryptCredentials(next.accessToken, secret)),
      refreshToken: JSON.stringify(
        encryptCredentials(next.refreshToken, secret),
      ),
      expiresAt: new Date(next.expiresAt),
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(oauthConnections.id, connectionId));
}

function hasAnyScope(have: string[], wanted: string[]): boolean {
  for (const w of wanted) if (have.includes(w)) return true;
  return false;
}

/**
 * Select the Google Calendar provider for this (org, user[, account]).
 * Returns null when not configured / not connected / scope-missing.
 */
export async function selectGoogleCalendarProvider(
  input: SelectGoogleProviderInput,
): Promise<GoogleCalendarProvider | null> {
  if (!isGoogleWorkspaceConfigured()) return null;
  const conn = await loadActiveConnection(input);
  if (!conn) return null;
  const wanted = [
    GOOGLE_WORKSPACE_SCOPES.calendarEventsReadWrite,
    GOOGLE_WORKSPACE_SCOPES.calendarReadOnly,
  ];
  if (!hasAnyScope(conn.scopes, wanted)) return null;
  const credentials: GoogleCalendarCredentials = {
    provider: "google",
    service: "google_calendar",
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    expiresAt: conn.expiresAt,
    scopes: conn.scopes,
    accountEmail: conn.accountEmail,
    userId: input.userId,
  };
  return new GoogleCalendarProvider(credentials, {
    clientId: googleWorkspaceOAuthClientId() ?? undefined,
    clientSecret: googleWorkspaceOAuthClientSecret() ?? undefined,
    onCredentialsRefreshed: (next) => persistRefresh(conn.connectionId, next),
  });
}

export async function selectGoogleSheetsProvider(
  input: SelectGoogleProviderInput,
): Promise<GoogleSheetsProvider | null> {
  if (!isGoogleWorkspaceConfigured()) return null;
  const conn = await loadActiveConnection(input);
  if (!conn) return null;
  const wanted = [
    GOOGLE_WORKSPACE_SCOPES.spreadsheetsReadWrite,
    GOOGLE_WORKSPACE_SCOPES.spreadsheetsReadOnly,
  ];
  if (!hasAnyScope(conn.scopes, wanted)) return null;
  const credentials: GoogleSheetsCredentials = {
    provider: "google",
    service: "google_sheets",
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    expiresAt: conn.expiresAt,
    scopes: conn.scopes,
    accountEmail: conn.accountEmail,
    userId: input.userId,
  };
  return new GoogleSheetsProvider(credentials, {
    clientId: googleWorkspaceOAuthClientId() ?? undefined,
    clientSecret: googleWorkspaceOAuthClientSecret() ?? undefined,
    onCredentialsRefreshed: (next) => persistRefresh(conn.connectionId, next),
  });
}

export async function selectGoogleDriveProvider(
  input: SelectGoogleProviderInput,
): Promise<GoogleDriveProvider | null> {
  if (!isGoogleWorkspaceConfigured()) return null;
  const conn = await loadActiveConnection(input);
  if (!conn) return null;
  const wanted = [
    GOOGLE_WORKSPACE_SCOPES.driveFile,
    GOOGLE_WORKSPACE_SCOPES.driveReadOnly,
  ];
  if (!hasAnyScope(conn.scopes, wanted)) return null;
  const credentials: GoogleDriveCredentials = {
    provider: "google",
    service: "google_drive",
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    expiresAt: conn.expiresAt,
    scopes: conn.scopes,
    accountEmail: conn.accountEmail,
    userId: input.userId,
  };
  return new GoogleDriveProvider(credentials, {
    clientId: googleWorkspaceOAuthClientId() ?? undefined,
    clientSecret: googleWorkspaceOAuthClientSecret() ?? undefined,
    onCredentialsRefreshed: (next) => persistRefresh(conn.connectionId, next),
  });
}

/**
 * Selector for any service — useful for the connections-status page.
 */
export async function selectGoogleProviderForService(
  service: GoogleWorkspaceService,
  input: SelectGoogleProviderInput,
): Promise<
  GoogleCalendarProvider | GoogleSheetsProvider | GoogleDriveProvider | null
> {
  switch (service) {
    case "google_calendar":
      return selectGoogleCalendarProvider(input);
    case "google_sheets":
      return selectGoogleSheetsProvider(input);
    case "google_drive":
      return selectGoogleDriveProvider(input);
    case "gmail":
      // Gmail uses the existing P2.E messaging selector.
      return null;
  }
}
