import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { guestStayTokens } from "./guest-stays";
import { bookings } from "./bookings";
import { serviceRequests } from "./operations";
import { appUsers } from "./identity";

/**
 * V9H — guest AI concierge v0 (token-scoped, read-only).
 *
 *   - `guest_ai_concierge_sessions` — one chat thread per stay token. We
 *     keep at most one `active` row per token via partial unique index;
 *     archiving releases the slot.
 *   - `guest_ai_concierge_messages` — append-only transcript. `role` is
 *     `user|assistant|system`, `safety_status` flags refusals/redactions.
 *   - `guest_ai_concierge_runs` — per-AI-invocation metrics (model,
 *     prompt hash, safety flags, allowed context keys). One row per
 *     user message that goes to the model.
 */

export const guestAiConciergeSessions = pgTable(
  "guest_ai_concierge_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guestStayTokenId: uuid("guest_stay_token_id")
      .notNull()
      .references(() => guestStayTokens.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("active"),
    title: text("title"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_ai_concierge_sessions_active_unique")
      .on(t.guestStayTokenId)
      .where(sql`${t.status} = 'active'`),
    index("guest_ai_concierge_sessions_token_idx").on(t.guestStayTokenId),
    index("guest_ai_concierge_sessions_booking_idx").on(t.bookingId),
    index("guest_ai_concierge_sessions_status_idx").on(t.status),
    index("guest_ai_concierge_sessions_last_message_idx").on(
      sql`${t.lastMessageAt} DESC`,
    ),
  ],
);

export const guestAiConciergeMessages = pgTable(
  "guest_ai_concierge_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => guestAiConciergeSessions.id, {
        onDelete: "cascade",
      }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    safetyStatus: text("safety_status").notNull().default("ok"),
    citationsJson: jsonb("citations_json"),
    toolContextJson: jsonb("tool_context_json"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("guest_ai_concierge_messages_session_idx").on(
      t.sessionId,
      t.createdAt,
    ),
    index("guest_ai_concierge_messages_safety_idx").on(t.safetyStatus),
  ],
);

export const guestAiConciergeRuns = pgTable(
  "guest_ai_concierge_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => guestAiConciergeSessions.id, {
        onDelete: "cascade",
      }),
    status: text("status").notNull().default("running"),
    model: text("model"),
    promptHash: text("prompt_hash"),
    safetyFlags: jsonb("safety_flags"),
    allowedContextKeys: jsonb("allowed_context_keys"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("guest_ai_concierge_runs_session_idx").on(t.sessionId),
    index("guest_ai_concierge_runs_status_idx").on(t.status),
    index("guest_ai_concierge_runs_started_idx").on(
      sql`${t.startedAt} DESC`,
    ),
  ],
);

export type GuestAiConciergeSession =
  typeof guestAiConciergeSessions.$inferSelect;
export type NewGuestAiConciergeSession =
  typeof guestAiConciergeSessions.$inferInsert;
export type GuestAiConciergeMessage =
  typeof guestAiConciergeMessages.$inferSelect;
export type NewGuestAiConciergeMessage =
  typeof guestAiConciergeMessages.$inferInsert;
export type GuestAiConciergeRun = typeof guestAiConciergeRuns.$inferSelect;
export type NewGuestAiConciergeRun =
  typeof guestAiConciergeRuns.$inferInsert;

/**
 * V9I — operational handoff between the AI concierge and live staff.
 *
 *   - One row per "Ask human concierge" / "Report this to staff" tap.
 *   - Optional FK to the `service_requests` row created in the same
 *     transaction. When present the row is the system of record for
 *     ops; the handoff carries the conversation context.
 *   - `last_messages_json` stores the redacted last 3 messages from
 *     the chat (user + assistant only). Never raw secrets.
 */
export const guestAiHandoffs = pgTable(
  "guest_ai_handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guestAiConciergeSessionId: uuid("guest_ai_concierge_session_id")
      .notNull()
      .references(() => guestAiConciergeSessions.id, {
        onDelete: "cascade",
      }),
    guestStayTokenId: uuid("guest_stay_token_id")
      .notNull()
      .references(() => guestStayTokens.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    serviceRequestId: uuid("service_request_id").references(
      () => serviceRequests.id,
      { onDelete: "set null" },
    ),
    handoffType: text("handoff_type").notNull(),
    status: text("status").notNull().default("created"),
    guestSummary: text("guest_summary").notNull(),
    lastMessagesJson: jsonb("last_messages_json")
      .notNull()
      .default(sql`'[]'::jsonb`),
    safetyFlags: jsonb("safety_flags"),
    priority: text("priority").notNull().default("normal"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdByIpHash: text("created_by_ip_hash"),
    createdByUserAgent: text("created_by_user_agent"),
    /** v9J — SLA + unread metrics. */
    firstStaffReplyAt: timestamp("first_staff_reply_at", {
      withTimezone: true,
    }),
    lastGuestReplyAt: timestamp("last_guest_reply_at", {
      withTimezone: true,
    }),
    lastStaffReplyAt: timestamp("last_staff_reply_at", {
      withTimezone: true,
    }),
    guestUnreadCount: integer("guest_unread_count").notNull().default(0),
    staffUnreadCount: integer("staff_unread_count").notNull().default(0),
  },
  (t) => [
    index("guest_ai_handoffs_session_idx").on(t.guestAiConciergeSessionId),
    index("guest_ai_handoffs_token_idx").on(t.guestStayTokenId),
    index("guest_ai_handoffs_booking_idx").on(t.bookingId),
    index("guest_ai_handoffs_service_request_idx").on(t.serviceRequestId),
    index("guest_ai_handoffs_status_idx").on(t.status),
    index("guest_ai_handoffs_priority_idx").on(t.priority),
    index("guest_ai_handoffs_created_at_idx").on(
      sql`${t.createdAt} DESC`,
    ),
  ],
);

export type GuestAiHandoff = typeof guestAiHandoffs.$inferSelect;
export type NewGuestAiHandoff = typeof guestAiHandoffs.$inferInsert;

/**
 * V9J — append-only two-way conversation log between the guest and
 * staff for a given handoff. Both sides read the same table; the
 * guest projection filters to `visibility='guest_visible'` only.
 *
 * `body` is the original input (audit-friendly). `body_redacted` is
 * what every UI surface actually renders — codes, tokens, emails,
 * phones, password patterns are scrubbed.
 */
export const guestAiHandoffReplies = pgTable(
  "guest_ai_handoff_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handoffId: uuid("handoff_id")
      .notNull()
      .references(() => guestAiHandoffs.id, { onDelete: "cascade" }),
    serviceRequestId: uuid("service_request_id").references(
      () => serviceRequests.id,
      { onDelete: "set null" },
    ),
    authorType: text("author_type").notNull(),
    authorAppUserId: uuid("author_app_user_id").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    visibility: text("visibility").notNull().default("guest_visible"),
    body: text("body").notNull(),
    bodyRedacted: text("body_redacted").notNull(),
    replyType: text("reply_type").notNull().default("message"),
    statusSnapshot: text("status_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readByGuestAt: timestamp("read_by_guest_at", { withTimezone: true }),
    readByStaffAt: timestamp("read_by_staff_at", { withTimezone: true }),
  },
  (t) => [
    index("guest_ai_handoff_replies_handoff_idx").on(
      t.handoffId,
      t.createdAt,
    ),
    index("guest_ai_handoff_replies_service_request_idx").on(
      t.serviceRequestId,
    ),
    index("guest_ai_handoff_replies_created_at_idx").on(
      sql`${t.createdAt} DESC`,
    ),
    index("guest_ai_handoff_replies_visibility_idx").on(t.visibility),
  ],
);

export type GuestAiHandoffReply = typeof guestAiHandoffReplies.$inferSelect;
export type NewGuestAiHandoffReply =
  typeof guestAiHandoffReplies.$inferInsert;

/**
 * V9K — append-only per-message read receipts. One row per
 * (reply, reader_type, principal). The principal is either an
 * `app_users.id` (staff) or a `guest_stay_tokens.id` (guest). The
 * partial unique index in the migration uses COALESCE to enforce
 * idempotency without NULL ambiguity.
 */
export const guestAiHandoffReplyReads = pgTable(
  "guest_ai_handoff_reply_reads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    replyId: uuid("reply_id")
      .notNull()
      .references(() => guestAiHandoffReplies.id, { onDelete: "cascade" }),
    handoffId: uuid("handoff_id")
      .notNull()
      .references(() => guestAiHandoffs.id, { onDelete: "cascade" }),
    readerType: text("reader_type").notNull(),
    readerAppUserId: uuid("reader_app_user_id").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    readerTokenId: uuid("reader_token_id").references(
      () => guestStayTokens.id,
      { onDelete: "cascade" },
    ),
    readAt: timestamp("read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_ai_handoff_reply_reads_principal_unique").on(
      t.replyId,
      t.readerType,
      sql`COALESCE(${t.readerAppUserId}, ${t.readerTokenId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    index("guest_ai_handoff_reply_reads_reply_idx").on(t.replyId),
    index("guest_ai_handoff_reply_reads_handoff_idx").on(t.handoffId),
    index("guest_ai_handoff_reply_reads_reader_idx").on(
      t.readerType,
      t.readerAppUserId,
      t.readerTokenId,
    ),
    index("guest_ai_handoff_reply_reads_read_at_idx").on(
      sql`${t.readAt} DESC`,
    ),
  ],
);

export type GuestAiHandoffReplyRead =
  typeof guestAiHandoffReplyReads.$inferSelect;
export type NewGuestAiHandoffReplyRead =
  typeof guestAiHandoffReplyReads.$inferInsert;

/**
 * V9K — Supabase-Storage-backed file uploads on a reply. We persist
 * ONLY `storageBucket` + `storagePath`; never a public URL. Listing
 * mints short-lived signed URLs at read time. CHECK constraints on
 * MIME type, size, status, visibility, and uploader type live on
 * the migration.
 */
export const guestAiHandoffReplyAttachments = pgTable(
  "guest_ai_handoff_reply_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    replyId: uuid("reply_id")
      .notNull()
      .references(() => guestAiHandoffReplies.id, { onDelete: "cascade" }),
    handoffId: uuid("handoff_id")
      .notNull()
      .references(() => guestAiHandoffs.id, { onDelete: "cascade" }),
    serviceRequestId: uuid("service_request_id").references(
      () => serviceRequests.id,
      { onDelete: "set null" },
    ),
    storageBucket: text("storage_bucket")
      .notNull()
      .default("guest-request-attachments"),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
    uploadedByType: text("uploaded_by_type").notNull(),
    uploadedByAppUserId: uuid("uploaded_by_app_user_id").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    uploadedByTokenId: uuid("uploaded_by_token_id").references(
      () => guestStayTokens.id,
      { onDelete: "cascade" },
    ),
    uploadStatus: text("upload_status").notNull().default("pending"),
    visibility: text("visibility").notNull().default("guest_visible"),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    checksumSha256: text("checksum_sha256"),
    signedUrlExpiresAt: timestamp("signed_url_expires_at", {
      withTimezone: true,
    }),
    /** v9L — post-upload processing pipeline. */
    metadataStatus: text("metadata_status").notNull().default("pending"),
    metadataStrippedAt: timestamp("metadata_stripped_at", {
      withTimezone: true,
    }),
    metadataError: text("metadata_error"),
    originalSizeBytes: bigint("original_size_bytes", { mode: "bigint" }),
    processedSizeBytes: bigint("processed_size_bytes", { mode: "bigint" }),
    cleanupEligibleAt: timestamp("cleanup_eligible_at", {
      withTimezone: true,
    }),
    deletedReason: text("deleted_reason"),
    securityScanStatus: text("security_scan_status")
      .notNull()
      .default("not_scanned"),
    securityScanNotes: text("security_scan_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("guest_ai_handoff_reply_attachments_reply_idx").on(t.replyId),
    index("guest_ai_handoff_reply_attachments_handoff_idx").on(t.handoffId),
    index("guest_ai_handoff_reply_attachments_status_idx").on(t.uploadStatus),
    index("guest_ai_handoff_reply_attachments_visibility_idx").on(t.visibility),
    uniqueIndex("guest_ai_handoff_reply_attachments_storage_unique").on(
      t.storageBucket,
      t.storagePath,
    ),
    index("attachment_metadata_status_idx").on(t.metadataStatus),
    index("attachment_cleanup_eligible_idx")
      .on(t.cleanupEligibleAt)
      .where(sql`${t.cleanupEligibleAt} IS NOT NULL`),
    index("attachment_security_scan_status_idx").on(t.securityScanStatus),
  ],
);

export type GuestAiHandoffReplyAttachment =
  typeof guestAiHandoffReplyAttachments.$inferSelect;
export type NewGuestAiHandoffReplyAttachment =
  typeof guestAiHandoffReplyAttachments.$inferInsert;
