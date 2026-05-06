/**
 * Stage 6.P2.B — WhatsApp Meta Cloud API client.
 *
 * Bearer-token auth against the Graph API. Native fetch via the shared
 * retry envelope from P1 — same retry/backoff/429 semantics as every
 * other provider.
 *
 * Credentials live on the instance; the caller decrypts the JSONB
 * column once and passes the plaintext object in. The client never
 * logs credentials.
 *
 * Endpoints (Graph API v18.0):
 *   - POST /{phone_number_id}/messages           — send (text + media + template)
 *   - POST /{phone_number_id}/messages           — mark_as_read action
 *   - GET  /{phone_number_id}/whatsapp_business_profile
 */

import { requestWithRetry, type RetryOptions } from "@/lib/channel-manager/http-retry";

const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";

export interface WhatsAppMetaCloudCredentials {
  channel: "whatsapp";
  provider: "meta_cloud";
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  appSecret: string;
}

export interface WhatsAppMetaClientOptions extends RetryOptions {
  apiBase?: string;
}

export interface WhatsAppMetaClientResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

export class WhatsAppMetaClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: WhatsAppMetaCloudCredentials,
    opts: WhatsAppMetaClientOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? GRAPH_API_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  get baseUrl(): string {
    return this.apiBase;
  }

  /** Public for tests + introspection — never logged. */
  get authHeader(): string {
    return `Bearer ${this.creds.accessToken}`;
  }

  // -------------------------------------------------------------------------
  // Outbound — send message variants
  // -------------------------------------------------------------------------

  async sendText(input: {
    to: string;
    text: string;
    replyToMessageId?: string;
  }): Promise<WhatsAppMetaClientResponse> {
    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "text",
      text: { body: input.text },
    };
    if (input.replyToMessageId) {
      body.context = { message_id: input.replyToMessageId };
    }
    return this.post(`/${this.creds.phoneNumberId}/messages`, body);
  }

  async sendMedia(input: {
    to: string;
    mediaType: "image" | "document" | "audio" | "video";
    mediaUrl: string;
    caption?: string;
  }): Promise<WhatsAppMetaClientResponse> {
    const mediaPayload: Record<string, unknown> = { link: input.mediaUrl };
    if (input.caption && input.mediaType !== "audio") {
      mediaPayload.caption = input.caption;
    }
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: input.mediaType,
      [input.mediaType]: mediaPayload,
    };
    return this.post(`/${this.creds.phoneNumberId}/messages`, body);
  }

  async sendTemplate(input: {
    to: string;
    templateName: string;
    languageCode: string;
    /** Body parameter values in order — Meta uses positional substitution. */
    bodyParameters: string[];
  }): Promise<WhatsAppMetaClientResponse> {
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components: input.bodyParameters.length > 0
          ? [
              {
                type: "body",
                parameters: input.bodyParameters.map((p) => ({
                  type: "text",
                  text: p,
                })),
              },
            ]
          : undefined,
      },
    };
    return this.post(`/${this.creds.phoneNumberId}/messages`, body);
  }

  /** POST a status update — typically the 'read' receipt for an inbound msg. */
  async markAsRead(messageId: string): Promise<WhatsAppMetaClientResponse> {
    return this.post(`/${this.creds.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  async getBusinessProfile(): Promise<WhatsAppMetaClientResponse> {
    return this.dispatch(
      "GET",
      `${this.apiBase}/${this.creds.phoneNumberId}/whatsapp_business_profile?fields=verified_name,messaging_limit`,
    );
  }

  // -------------------------------------------------------------------------
  // Internal — JSON POST + shared retry envelope
  // -------------------------------------------------------------------------

  private async post(
    path: string,
    body: unknown,
  ): Promise<WhatsAppMetaClientResponse> {
    return this.dispatch("POST", `${this.apiBase}${path}`, body);
  }

  private async dispatch(
    method: string,
    url: string,
    jsonBody?: unknown,
  ): Promise<WhatsAppMetaClientResponse> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (jsonBody !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(jsonBody);
    }
    const result = await requestWithRetry(
      url,
      { method, headers, body },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }
}

export { GRAPH_API_BASE as WHATSAPP_META_API_BASE };
