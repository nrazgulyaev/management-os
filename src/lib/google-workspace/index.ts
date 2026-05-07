/**
 * Stage 6.P5 — Google Workspace public surface.
 *
 * Selectors + service-layer functions are re-exported here so the
 * rest of the platform imports `@/lib/google-workspace` rather than
 * reaching into the per-service subfolders.
 */

export type {
  GoogleWorkspaceService,
  GoogleWorkspaceCredentials,
  GoogleCalendarCredentials,
  GoogleSheetsCredentials,
  GoogleDriveCredentials,
  GoogleConnectionTestResult,
  GoogleCredentialsUpdate,
} from "./types";
export { GOOGLE_WORKSPACE_SCOPES } from "./types";
export {
  buildGoogleAuthorizeUrl,
  exchangeGoogleCode,
} from "./oauth-flow";
export type { CalendarEventRecord } from "./calendar/parsers";
export type { DriveFileRecord } from "./drive/provider";
export { GoogleCalendarProvider } from "./calendar/provider";
export { GoogleSheetsProvider, extractSpreadsheetIdFromUrl } from "./sheets/provider";
export { GoogleDriveProvider } from "./drive/provider";
