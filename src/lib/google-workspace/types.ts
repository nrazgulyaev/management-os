/**
 * Stage 6.P5 — Google Workspace shared types.
 *
 * One OAuth client serves Calendar, Gmail (already in P2.E), Sheets,
 * and Drive. Per-service scopes requested at consent time + persisted
 * on the `oauth_connections.scopes` array. Discriminated credential
 * unions per service so each provider's selector can fail closed
 * cleanly when scopes are missing.
 */

export type GoogleWorkspaceService =
  | "google_calendar"
  | "gmail"
  | "google_sheets"
  | "google_drive";

/**
 * Scope catalog. Each surface declares the minimal scope it needs;
 * the consent screen unions the requested scopes per session.
 */
export const GOOGLE_WORKSPACE_SCOPES = {
  // Calendar
  calendarEventsReadWrite: "https://www.googleapis.com/auth/calendar.events",
  calendarReadOnly: "https://www.googleapis.com/auth/calendar.readonly",
  // Gmail (P2.E uses these — kept here as the canonical source-of-truth)
  gmailReadOnly: "https://www.googleapis.com/auth/gmail.readonly",
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
  gmailModify: "https://www.googleapis.com/auth/gmail.modify",
  // Sheets
  spreadsheetsReadWrite: "https://www.googleapis.com/auth/spreadsheets",
  spreadsheetsReadOnly:
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  // Drive
  driveFile: "https://www.googleapis.com/auth/drive.file",
  driveReadOnly: "https://www.googleapis.com/auth/drive.readonly",
  // Common
  userinfoEmail: "https://www.googleapis.com/auth/userinfo.email",
  userinfoProfile: "https://www.googleapis.com/auth/userinfo.profile",
} as const;

/**
 * Shared credential shape. Persisted (encrypted) to
 * `oauth_connections` for `provider = 'google'`. Each service's
 * discriminated credential extends this with `service` + the
 * minimum scopes it asserts at consent time.
 */
export interface GoogleWorkspaceBaseCredentials {
  provider: "google";
  accessToken: string;
  refreshToken: string;
  /** Unix epoch ms — when accessToken expires. */
  expiresAt: number;
  scopes: string[];
  accountEmail: string;
  /** Owning app_user — every Google OAuth grant is per-user. */
  userId: string;
}

export interface GoogleCalendarCredentials
  extends GoogleWorkspaceBaseCredentials {
  service: "google_calendar";
}

export interface GoogleSheetsCredentials
  extends GoogleWorkspaceBaseCredentials {
  service: "google_sheets";
}

export interface GoogleDriveCredentials
  extends GoogleWorkspaceBaseCredentials {
  service: "google_drive";
}

export type GoogleWorkspaceCredentials =
  | GoogleCalendarCredentials
  | GoogleSheetsCredentials
  | GoogleDriveCredentials;

/**
 * Update payload emitted to the persistence callback when the client
 * refreshes tokens at runtime. Same shape across all 3 services so
 * the service layer's persistence write is generic.
 */
export interface GoogleCredentialsUpdate {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Standard test result returned by every Google service selector. */
export interface GoogleConnectionTestResult {
  connected: boolean;
  service: GoogleWorkspaceService;
  accountEmail?: string;
  scopes?: string[];
  error?: string;
}
