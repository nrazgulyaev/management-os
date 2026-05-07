/**
 * Stage 6.P5.E — Google Drive API client.
 *
 * Same auto-refresh pattern as Calendar + Sheets. Surface (Drive v3):
 *   GET    /files                       — list (paginated)
 *   GET    /files/{id}                  — metadata
 *   GET    /files/{id}?alt=media        — download bytes
 *   POST   /upload/drive/v3/files       — upload metadata + media (multipart)
 *   DELETE /files/{id}
 *
 * Uses the `drive.file` scope by default — only files the app
 * created or that the user explicitly opens are visible. This keeps
 * the blast radius small.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import { refreshGoogleToken } from "@/lib/oauth/google";
import type { GoogleCredentialsUpdate } from "../types";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const DEFAULT_REFRESH_MARGIN_MS = 60_000;

export interface GoogleDriveClientOptions extends RetryOptions {
  apiBase?: string;
  uploadBase?: string;
  clientId?: string;
  clientSecret?: string;
  onCredentialsRefreshed?: (next: GoogleCredentialsUpdate) => Promise<void> | void;
  refreshMarginMs?: number;
}

export interface GoogleDriveClientResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

interface MutableCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class GoogleDriveClient {
  private creds: MutableCredentials;
  private readonly apiBase: string;
  private readonly uploadBase: string;
  private readonly retryOpts: RetryOptions;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly onCredentialsRefreshed?: (
    next: GoogleCredentialsUpdate,
  ) => Promise<void> | void;
  private readonly refreshMarginMs: number;

  constructor(
    initial: MutableCredentials,
    opts: GoogleDriveClientOptions = {},
  ) {
    this.creds = { ...initial };
    this.apiBase = opts.apiBase ?? DRIVE_API_BASE;
    this.uploadBase = opts.uploadBase ?? DRIVE_UPLOAD_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.onCredentialsRefreshed = opts.onCredentialsRefreshed;
    this.refreshMarginMs = opts.refreshMarginMs ?? DEFAULT_REFRESH_MARGIN_MS;
  }

  async listFiles(input: {
    q?: string;
    pageSize?: number;
    pageToken?: string;
    fields?: string;
  } = {}): Promise<GoogleDriveClientResponse> {
    const params = new URLSearchParams();
    if (input.q) params.set("q", input.q);
    if (input.pageSize) params.set("pageSize", String(input.pageSize));
    if (input.pageToken) params.set("pageToken", input.pageToken);
    params.set(
      "fields",
      input.fields ??
        "files(id,name,mimeType,size,modifiedTime,webViewLink),nextPageToken",
    );
    return this.authenticated({
      method: "GET",
      path: `/files?${params.toString()}`,
    });
  }

  async getFile(input: {
    fileId: string;
    fields?: string;
  }): Promise<GoogleDriveClientResponse> {
    const params = new URLSearchParams({
      fields:
        input.fields ??
        "id,name,mimeType,size,modifiedTime,webViewLink,parents",
    });
    return this.authenticated({
      method: "GET",
      path: `/files/${encodeURIComponent(input.fileId)}?${params.toString()}`,
    });
  }

  async deleteFile(input: { fileId: string }): Promise<GoogleDriveClientResponse> {
    return this.authenticated({
      method: "DELETE",
      path: `/files/${encodeURIComponent(input.fileId)}`,
    });
  }

  /**
   * Multipart upload — single round-trip for files up to ~5 MB.
   * For larger files, the resumable-upload protocol is appropriate;
   * intentionally out of scope until P7 (investor doc repo) where
   * the file sizes can grow.
   */
  async uploadFileMultipart(input: {
    name: string;
    mimeType: string;
    content: Uint8Array | string;
    parents?: string[];
  }): Promise<GoogleDriveClientResponse> {
    await this.refreshIfNeeded();
    const boundary = `----arconique-${Math.random().toString(36).slice(2)}`;
    const contentBuf =
      typeof input.content === "string"
        ? new TextEncoder().encode(input.content)
        : input.content;
    const metadata = JSON.stringify({
      name: input.name,
      mimeType: input.mimeType,
      ...(input.parents ? { parents: input.parents } : {}),
    });
    const headerPart =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${input.mimeType}\r\n\r\n`;
    const trailer = `\r\n--${boundary}--`;
    const headerBytes = new TextEncoder().encode(headerPart);
    const trailerBytes = new TextEncoder().encode(trailer);
    const body = new Uint8Array(
      headerBytes.byteLength + contentBuf.byteLength + trailerBytes.byteLength,
    );
    body.set(headerBytes, 0);
    body.set(contentBuf, headerBytes.byteLength);
    body.set(trailerBytes, headerBytes.byteLength + contentBuf.byteLength);

    const url = `${this.uploadBase}/files?uploadType=multipart`;
    const init: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.creds.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    };
    let result = await requestWithRetry(url, init, this.retryOpts);
    if (result.status === 401 && this.canRefresh()) {
      await this.forceRefresh();
      const init2 = {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${this.creds.accessToken}`,
        },
      };
      result = await requestWithRetry(url, init2, this.retryOpts);
    }
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }

  currentCredentials(): MutableCredentials {
    return { ...this.creds };
  }

  private async authenticated(input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    body?: Record<string, unknown>;
  }): Promise<GoogleDriveClientResponse> {
    await this.refreshIfNeeded();
    let result = await this.request(input);
    if (result.status === 401 && this.canRefresh()) {
      await this.forceRefresh();
      result = await this.request(input);
    }
    return result;
  }

  private async request(input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    body?: Record<string, unknown>;
  }): Promise<GoogleDriveClientResponse> {
    const url = `${this.apiBase}${input.path}`;
    const init: RequestInit = {
      method: input.method,
      headers: {
        Authorization: `Bearer ${this.creds.accessToken}`,
        Accept: "application/json",
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
    };
    if (input.body) init.body = JSON.stringify(input.body);
    const result = await requestWithRetry(url, init, this.retryOpts);
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }

  private async refreshIfNeeded(): Promise<void> {
    if (!this.canRefresh()) return;
    const now = Date.now();
    if (now < this.creds.expiresAt - this.refreshMarginMs) return;
    await this.forceRefresh();
  }

  private async forceRefresh(): Promise<void> {
    if (!this.canRefresh()) return;
    const next = await refreshGoogleToken({
      refreshToken: this.creds.refreshToken,
      clientId: this.clientId!,
      clientSecret: this.clientSecret!,
      fetch: this.retryOpts.fetch,
    });
    this.creds = {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken ?? this.creds.refreshToken,
      expiresAt: next.expiresAt,
    };
    if (this.onCredentialsRefreshed) {
      await this.onCredentialsRefreshed({
        accessToken: this.creds.accessToken,
        refreshToken: this.creds.refreshToken,
        expiresAt: this.creds.expiresAt,
      });
    }
  }

  private canRefresh(): boolean {
    return Boolean(
      this.creds.refreshToken && this.clientId && this.clientSecret,
    );
  }
}
