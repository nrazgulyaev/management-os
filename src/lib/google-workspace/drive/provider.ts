/**
 * Stage 6.P5.E — Google Drive provider.
 *
 * Wraps the Drive client behind a normalized list/get/upload/delete
 * surface. The platform's `documents` table can hold a Drive
 * `externalRef` as an alternative to local Supabase Storage — the
 * service layer chooses the storage backend per document.
 */

import {
  GoogleDriveClient,
  type GoogleDriveClientOptions,
} from "./client";
import type {
  GoogleDriveCredentials,
  GoogleConnectionTestResult,
} from "../types";

export interface DriveFileRecord {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  modifiedAt?: Date;
  webViewLink?: string;
  parents?: string[];
}

export interface GoogleDriveProviderInterface {
  readonly service: "google_drive";
  listFiles(input: {
    q?: string;
    pageSize?: number;
    pageToken?: string;
  }): Promise<{ files: DriveFileRecord[]; nextPageToken?: string }>;
  getFile(input: { fileId: string }): Promise<DriveFileRecord | null>;
  uploadFile(input: {
    name: string;
    mimeType: string;
    content: Uint8Array | string;
    parents?: string[];
  }): Promise<DriveFileRecord | null>;
  deleteFile(input: { fileId: string }): Promise<{ deleted: boolean }>;
  testConnection(): Promise<GoogleConnectionTestResult>;
}

export class GoogleDriveProvider implements GoogleDriveProviderInterface {
  readonly service = "google_drive" as const;
  private readonly client: GoogleDriveClient;
  private readonly creds: GoogleDriveCredentials;

  constructor(
    credentials: GoogleDriveCredentials,
    opts: GoogleDriveClientOptions = {},
  ) {
    this.creds = credentials;
    this.client = new GoogleDriveClient(
      {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      },
      opts,
    );
  }

  async listFiles(input: {
    q?: string;
    pageSize?: number;
    pageToken?: string;
  } = {}): Promise<{ files: DriveFileRecord[]; nextPageToken?: string }> {
    const result = await this.client.listFiles(input);
    if (result.status < 200 || result.status >= 300) {
      return { files: [] };
    }
    let parsed: {
      files?: Array<Record<string, unknown>>;
      nextPageToken?: string;
    };
    try {
      parsed = JSON.parse(result.body) as typeof parsed;
    } catch {
      return { files: [] };
    }
    const files = (parsed.files ?? [])
      .map(mapDriveFile)
      .filter((r): r is DriveFileRecord => r !== null);
    return { files, nextPageToken: parsed.nextPageToken };
  }

  async getFile(input: {
    fileId: string;
  }): Promise<DriveFileRecord | null> {
    const result = await this.client.getFile(input);
    if (result.status < 200 || result.status >= 300) return null;
    try {
      return mapDriveFile(JSON.parse(result.body) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  async uploadFile(input: {
    name: string;
    mimeType: string;
    content: Uint8Array | string;
    parents?: string[];
  }): Promise<DriveFileRecord | null> {
    const result = await this.client.uploadFileMultipart(input);
    if (result.status < 200 || result.status >= 300) return null;
    try {
      return mapDriveFile(JSON.parse(result.body) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  async deleteFile(input: {
    fileId: string;
  }): Promise<{ deleted: boolean }> {
    const result = await this.client.deleteFile(input);
    return { deleted: result.status >= 200 && result.status < 300 };
  }

  async testConnection(): Promise<GoogleConnectionTestResult> {
    try {
      const result = await this.client.listFiles({ pageSize: 1 });
      const ok = result.status >= 200 && result.status < 300;
      return {
        connected: ok,
        service: "google_drive",
        accountEmail: this.creds.accountEmail,
        scopes: this.creds.scopes,
        ...(ok ? {} : { error: `HTTP ${result.status}` }),
      };
    } catch (err) {
      return {
        connected: false,
        service: "google_drive",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function mapDriveFile(
  row: Record<string, unknown>,
): DriveFileRecord | null {
  const id = typeof row["id"] === "string" ? row["id"] : undefined;
  const name = typeof row["name"] === "string" ? row["name"] : undefined;
  const mimeType =
    typeof row["mimeType"] === "string" ? row["mimeType"] : undefined;
  if (!id || !name || !mimeType) return null;
  const sizeRaw = row["size"];
  const sizeBytes =
    typeof sizeRaw === "string"
      ? Number(sizeRaw)
      : typeof sizeRaw === "number"
        ? sizeRaw
        : undefined;
  const modifiedTime =
    typeof row["modifiedTime"] === "string"
      ? (row["modifiedTime"] as string)
      : undefined;
  const modifiedAt =
    modifiedTime && !Number.isNaN(Date.parse(modifiedTime))
      ? new Date(modifiedTime)
      : undefined;
  const parents = Array.isArray(row["parents"])
    ? (row["parents"] as unknown[]).filter(
        (p): p is string => typeof p === "string",
      )
    : undefined;
  return {
    id,
    name,
    mimeType,
    sizeBytes:
      typeof sizeBytes === "number" && Number.isFinite(sizeBytes)
        ? sizeBytes
        : undefined,
    modifiedAt,
    webViewLink:
      typeof row["webViewLink"] === "string"
        ? (row["webViewLink"] as string)
        : undefined,
    parents,
  };
}
