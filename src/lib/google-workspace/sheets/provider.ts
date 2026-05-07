/**
 * Stage 6.P5.D — Google Sheets provider.
 *
 * Two-mode surface:
 *   - read: pull values from a sheet (used by bulk-import to swallow
 *     a Google Sheets URL the same way it swallows a CSV today)
 *   - write: append rows / write ranges (used by the deferred
 *     bulk-export "send to Google Sheets" surface)
 *
 * Both modes go through the same client; the provider just shapes
 * the I/O.
 */

import {
  GoogleSheetsClient,
  type GoogleSheetsClientOptions,
} from "./client";
import type {
  GoogleSheetsCredentials,
  GoogleConnectionTestResult,
} from "../types";

export interface GoogleSheetsProviderInterface {
  readonly service: "google_sheets";
  /** Read a contiguous A1-range from a spreadsheet. Returns rows. */
  readRange(input: {
    spreadsheetId: string;
    range: string;
  }): Promise<unknown[][]>;
  /** Append rows below the last filled row in `range`. */
  appendRows(input: {
    spreadsheetId: string;
    range: string;
    values: unknown[][];
  }): Promise<{ updatedRows: number }>;
  /** Replace `range` with `values`. */
  writeRange(input: {
    spreadsheetId: string;
    range: string;
    values: unknown[][];
  }): Promise<{ updatedRows: number }>;
  /** Create a brand-new spreadsheet titled `title`. */
  createSpreadsheet(input: {
    title: string;
  }): Promise<{ spreadsheetId: string; htmlLink?: string }>;
  testConnection(): Promise<GoogleConnectionTestResult>;
}

export class GoogleSheetsProvider implements GoogleSheetsProviderInterface {
  readonly service = "google_sheets" as const;
  private readonly client: GoogleSheetsClient;
  private readonly creds: GoogleSheetsCredentials;

  constructor(
    credentials: GoogleSheetsCredentials,
    opts: GoogleSheetsClientOptions = {},
  ) {
    this.creds = credentials;
    this.client = new GoogleSheetsClient(
      {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      },
      opts,
    );
  }

  async readRange(input: {
    spreadsheetId: string;
    range: string;
  }): Promise<unknown[][]> {
    const result = await this.client.getValues(input);
    if (result.status < 200 || result.status >= 300) return [];
    try {
      const parsed = JSON.parse(result.body) as { values?: unknown[][] };
      return parsed.values ?? [];
    } catch {
      return [];
    }
  }

  async appendRows(input: {
    spreadsheetId: string;
    range: string;
    values: unknown[][];
  }): Promise<{ updatedRows: number }> {
    const result = await this.client.appendValues(input);
    if (result.status < 200 || result.status >= 300) return { updatedRows: 0 };
    try {
      const parsed = JSON.parse(result.body) as {
        updates?: { updatedRows?: number };
      };
      return { updatedRows: parsed.updates?.updatedRows ?? 0 };
    } catch {
      return { updatedRows: 0 };
    }
  }

  async writeRange(input: {
    spreadsheetId: string;
    range: string;
    values: unknown[][];
  }): Promise<{ updatedRows: number }> {
    const result = await this.client.updateValues(input);
    if (result.status < 200 || result.status >= 300) return { updatedRows: 0 };
    try {
      const parsed = JSON.parse(result.body) as { updatedRows?: number };
      return { updatedRows: parsed.updatedRows ?? 0 };
    } catch {
      return { updatedRows: 0 };
    }
  }

  async createSpreadsheet(input: {
    title: string;
  }): Promise<{ spreadsheetId: string; htmlLink?: string }> {
    const result = await this.client.createSpreadsheet(input);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Google Sheets createSpreadsheet failed: HTTP ${result.status}`,
      );
    }
    try {
      const parsed = JSON.parse(result.body) as {
        spreadsheetId?: string;
        spreadsheetUrl?: string;
      };
      if (!parsed.spreadsheetId) {
        throw new Error("createSpreadsheet response missing spreadsheetId");
      }
      return {
        spreadsheetId: parsed.spreadsheetId,
        htmlLink: parsed.spreadsheetUrl,
      };
    } catch {
      throw new Error("createSpreadsheet returned non-JSON response");
    }
  }

  async testConnection(): Promise<GoogleConnectionTestResult> {
    // Cheap test: hit /spreadsheets endpoint with no body — any auth
    // failure surfaces as 401, scope-mismatch as 403. There is no
    // dedicated "ping" surface in Sheets v4.
    try {
      const result = await this.client.getSpreadsheet({
        spreadsheetId: "1__test__",
      });
      // 404 (not-found) is fine — it means auth was accepted.
      const ok =
        (result.status >= 200 && result.status < 300) ||
        result.status === 404;
      return {
        connected: ok,
        service: "google_sheets",
        accountEmail: this.creds.accountEmail,
        scopes: this.creds.scopes,
        ...(ok ? {} : { error: `HTTP ${result.status}` }),
      };
    } catch (err) {
      return {
        connected: false,
        service: "google_sheets",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * Extract a spreadsheet id from a Google Sheets URL.
 * Accepts: https://docs.google.com/spreadsheets/d/{id}/...
 * Returns null on non-matching strings.
 */
export function extractSpreadsheetIdFromUrl(url: string): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}
