import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guestStayTokenVerifications } from "@/lib/db/schema/guest-stay-security";
import { guestStayTokens } from "@/lib/db/schema/guest-stays";
import { queueNotification } from "@/features/notifications/services";
import { isProduction } from "@/lib/env";
import { hashStayToken } from "./token";
import { recordSecurityEvent } from "./security";
import {
  canResend,
  defaultVerificationExpiresAt,
  evaluateVerification,
  generateVerificationCode,
  hashVerificationCode,
  maskRecipient,
  VERIFICATION_MAX_ATTEMPTS,
} from "./verification-pure";

export type VerificationChannel = "email" | "sms" | "whatsapp" | "manual";

export interface VerificationStatus {
  required: boolean;
  verified: boolean;
  pendingVerificationId: string | null;
  recipientMasked: string | null;
  expiresAt: string | null;
  attempts: number;
  maxAttempts: number;
  channel: VerificationChannel | null;
  /**
   * In dev fallback delivery (no provider configured), the freshly issued
   * code is bounced back to the caller so the local concierge can copy
   * it. Production NEVER returns this.
   */
  devCodePreview?: string;
}

export interface CanAccessOutcome {
  allowed: boolean;
  status: VerificationStatus;
}

/**
 * Lookup helper used by the guest portal to decide whether to render
 * the verification page or the actual stay surface. Returns the most
 * recent verification row (any status) so the UI can show
 * "expired/exhausted/verified" copy without re-querying.
 */
export async function canAccessStayWithoutVerification(args: {
  tokenHash: string;
}): Promise<CanAccessOutcome> {
  const db = getDb();
  if (!db)
    return {
      allowed: false,
      status: {
        required: true,
        verified: false,
        pendingVerificationId: null,
        recipientMasked: null,
        expiresAt: null,
        attempts: 0,
        maxAttempts: VERIFICATION_MAX_ATTEMPTS,
        channel: null,
      },
    };
  const [tokenRow] = await db
    .select()
    .from(guestStayTokens)
    .where(eq(guestStayTokens.tokenHash, args.tokenHash))
    .limit(1);
  if (!tokenRow) {
    return {
      allowed: false,
      status: {
        required: true,
        verified: false,
        pendingVerificationId: null,
        recipientMasked: null,
        expiresAt: null,
        attempts: 0,
        maxAttempts: VERIFICATION_MAX_ATTEMPTS,
        channel: null,
      },
    };
  }
  const [latest] = await db
    .select()
    .from(guestStayTokenVerifications)
    .where(
      eq(guestStayTokenVerifications.guestStayTokenId, tokenRow.id),
    )
    .orderBy(desc(guestStayTokenVerifications.createdAt))
    .limit(1);
  const verified = latest?.status === "verified";
  return {
    allowed: verified,
    status: {
      required: true,
      verified,
      pendingVerificationId:
        latest && latest.status === "pending" ? latest.id : null,
      recipientMasked: latest?.recipientMasked ?? null,
      expiresAt: latest?.expiresAt
        ? latest.expiresAt.toISOString()
        : null,
      attempts: latest?.attempts ?? 0,
      maxAttempts: latest?.maxAttempts ?? VERIFICATION_MAX_ATTEMPTS,
      channel: (latest?.channel as VerificationChannel) ?? null,
    },
  };
}

export interface IssueOptions {
  guestStayTokenId: string;
  channel?: VerificationChannel;
  ipHash?: string | null;
  userAgent?: string | null;
}

export interface IssueResult {
  ok: boolean;
  reason?: string;
  verificationId?: string;
  recipientMasked?: string | null;
  channel?: VerificationChannel;
  devCodePreview?: string;
  /**
   * The freshly minted plaintext code, returned UNCONDITIONALLY to the
   * server-side caller. Unlike `devCodePreview` (suppressed in prod), this
   * exists so an *authorized, permission-gated* concierge flow can read the
   * code aloud to a walk-in guest who has no email/phone. The caller is
   * responsible for only surfacing it to an org-scoped operator — it is NEVER
   * returned to an unauthenticated guest path.
   */
  issuedCode?: string;
  retryAfterMs?: number;
}

/**
 * Issue (or re-issue) a one-time code. Cancels any prior `pending` row
 * so the partial-unique index stays satisfied.
 */
export async function issueVerificationCode(
  opts: IssueOptions,
): Promise<IssueResult> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };

  const [tokenRow] = await db
    .select()
    .from(guestStayTokens)
    .where(eq(guestStayTokens.id, opts.guestStayTokenId))
    .limit(1);
  if (!tokenRow) return { ok: false, reason: "token_not_found" };
  if (tokenRow.status !== "active") {
    return { ok: false, reason: "token_inactive" };
  }

  // Cooldown: refuse if we issued one less than 60s ago.
  const [recent] = await db
    .select()
    .from(guestStayTokenVerifications)
    .where(eq(guestStayTokenVerifications.guestStayTokenId, tokenRow.id))
    .orderBy(desc(guestStayTokenVerifications.createdAt))
    .limit(1);
  const cooldown = canResend(recent?.createdAt ?? null);
  if (!cooldown.allowed) {
    return {
      ok: false,
      reason: "cooldown",
      retryAfterMs: cooldown.retryAfterMs,
    };
  }

  const recipient =
    tokenRow.issuedToEmail ?? tokenRow.issuedToPhone ?? null;
  const channel: VerificationChannel = (() => {
    if (opts.channel) return opts.channel;
    if (tokenRow.issuedToEmail) return "email";
    if (tokenRow.issuedToPhone) return "sms";
    return "manual";
  })();
  const recipientMasked = maskRecipient(recipient);

  // Cancel previous pending rows.
  if (recent && recent.status === "pending") {
    await db
      .update(guestStayTokenVerifications)
      .set({ status: "cancelled" })
      .where(eq(guestStayTokenVerifications.id, recent.id));
  }

  const code = generateVerificationCode();
  const codeHash = hashVerificationCode(code, tokenRow.tokenPrefix);
  const expiresAt = defaultVerificationExpiresAt();

  const [row] = await db
    .insert(guestStayTokenVerifications)
    .values({
      guestStayTokenId: tokenRow.id,
      verificationCodeHash: codeHash,
      channel,
      recipientMasked,
      expiresAt,
    })
    .returning({ id: guestStayTokenVerifications.id });

  const eventType = recent ? "verification_resent" : "verification_sent";
  await recordSecurityEvent({
    eventType,
    severity: "low",
    guestStayTokenId: tokenRow.id,
    bookingId: tokenRow.bookingId,
    ipHash: opts.ipHash ?? null,
    userAgent: opts.userAgent ?? null,
    metadata: { channel, recipientMasked },
  });

  // Best-effort delivery via the existing notification queue. If the
  // notification provider is dry-run / not configured, queue still
  // accepts the row; no-op in dev. We never log the plaintext code.
  if (recipient) {
    try {
      await queueNotification({
        recipientType: "guest",
        organizationId: tokenRow.organizationId,
        channel:
          channel === "email"
            ? "email"
            : channel === "sms"
              ? "sms"
              : channel === "whatsapp"
                ? "whatsapp"
                : "in_app",
        templateKey: "guest_stay.verification_code",
        title: "Your stay verification code",
        body: `Your Arconique stay verification code is ${code}. It expires in 10 minutes.`,
        payload: {
          recipient,
          recipientMasked,
          guestStayTokenId: tokenRow.id,
          tokenPrefix: tokenRow.tokenPrefix,
        },
        priority: "high",
        dedupeKey: `stay_verification:${row!.id}`,
      });
    } catch {
      // best-effort; the verification still exists and admin can resend
    }
  }

  // Dev fallback — never returned in production.
  const devCodePreview = !isProduction() ? code : undefined;

  return {
    ok: true,
    verificationId: row!.id,
    recipientMasked,
    channel,
    devCodePreview,
    // Always carried; only the authorized concierge action ever surfaces it.
    issuedCode: code,
  };
}

export interface VerifyOptions {
  token: string;
  code: string;
  ipHash?: string | null;
  userAgent?: string | null;
}

export type VerifyResult =
  | { ok: true; tokenHash: string }
  | {
      ok: false;
      reason:
        | "token_not_found"
        | "no_pending_verification"
        | "expired"
        | "exhausted"
        | "invalid_code"
        | "already_verified"
        | "cancelled"
        | "no_db";
      attemptsRemaining?: number;
    };

export async function verifyStayAccessCode(
  opts: VerifyOptions,
): Promise<VerifyResult> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const tokenHash = hashStayToken(opts.token);
  const [tokenRow] = await db
    .select()
    .from(guestStayTokens)
    .where(eq(guestStayTokens.tokenHash, tokenHash))
    .limit(1);
  if (!tokenRow) return { ok: false, reason: "token_not_found" };

  const [pending] = await db
    .select()
    .from(guestStayTokenVerifications)
    .where(
      and(
        eq(guestStayTokenVerifications.guestStayTokenId, tokenRow.id),
        eq(guestStayTokenVerifications.status, "pending"),
      ),
    )
    .orderBy(desc(guestStayTokenVerifications.createdAt))
    .limit(1);
  if (!pending) return { ok: false, reason: "no_pending_verification" };

  const outcome = evaluateVerification(
    {
      status: pending.status,
      attempts: pending.attempts,
      maxAttempts: pending.maxAttempts,
      expiresAt: pending.expiresAt,
      verificationCodeHash: pending.verificationCodeHash,
    },
    opts.code,
    tokenRow.tokenPrefix,
  );

  const now = new Date();
  if (outcome.ok) {
    await db
      .update(guestStayTokenVerifications)
      .set({
        status: "verified",
        verifiedAt: now,
      })
      .where(eq(guestStayTokenVerifications.id, pending.id));
    await recordSecurityEvent({
      eventType: "verification_verified",
      severity: "low",
      guestStayTokenId: tokenRow.id,
      bookingId: tokenRow.bookingId,
      ipHash: opts.ipHash ?? null,
      userAgent: opts.userAgent ?? null,
    });
    return { ok: true, tokenHash };
  }

  // Persist new attempts / status.
  await db
    .update(guestStayTokenVerifications)
    .set({
      attempts: outcome.nextAttempts,
      status: outcome.nextStatus,
    })
    .where(eq(guestStayTokenVerifications.id, pending.id));

  await recordSecurityEvent({
    eventType:
      outcome.reason === "expired"
        ? "verification_expired"
        : "verification_failed",
    severity:
      outcome.reason === "exhausted"
        ? "high"
        : outcome.reason === "expired"
          ? "low"
          : "medium",
    guestStayTokenId: tokenRow.id,
    bookingId: tokenRow.bookingId,
    ipHash: opts.ipHash ?? null,
    userAgent: opts.userAgent ?? null,
    metadata: {
      reason: outcome.reason,
      attempts: outcome.nextAttempts,
    },
  });

  const attemptsRemaining = Math.max(
    0,
    pending.maxAttempts - outcome.nextAttempts,
  );
  return {
    ok: false,
    reason: outcome.reason,
    attemptsRemaining,
  };
}

/** Admin: cancel any pending verification (e.g. after revoking the token). */
export async function cancelPendingVerifications(
  guestStayTokenId: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(guestStayTokenVerifications)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(
          guestStayTokenVerifications.guestStayTokenId,
          guestStayTokenId,
        ),
        eq(guestStayTokenVerifications.status, "pending"),
      ),
    );
}

export async function listVerificationsForToken(
  guestStayTokenId: string,
): Promise<typeof guestStayTokenVerifications.$inferSelect[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(guestStayTokenVerifications)
    .where(eq(guestStayTokenVerifications.guestStayTokenId, guestStayTokenId))
    .orderBy(desc(guestStayTokenVerifications.createdAt));
}
