"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashStayToken, hashIpForLog } from "./token";
import {
  cancelPendingVerifications,
  issueVerificationCode,
  verifyStayAccessCode,
} from "./verification";
import { rateLimitStayTokenAccess } from "./rate-limit";
import { getDb } from "@/lib/db/client";
import { guestStayTokens } from "@/lib/db/schema/guest-stays";
import { eq } from "drizzle-orm";

const submitSchema = z.object({
  token: z.string().min(16),
  code: z
    .string()
    .regex(/^\d{4,8}$/, "Enter the 6-digit code from the message we sent."),
});

const issueSchema = z.object({
  token: z.string().min(16),
});

export type VerifyActionState =
  | null
  | { ok: true; redirectTo: string; codePreview?: string }
  | { ok: false; error: string };

export async function submitStayVerificationAction(
  _prev: VerifyActionState | null,
  formData: FormData,
): Promise<VerifyActionState> {
  const parsed = submitSchema.safeParse({
    token: formData.get("token"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;

  // Verification rate limiter (5 attempts / 10 min per (prefix, ip)).
  const tokenPrefix = parsed.data.token.slice(0, 8);
  const rl = await rateLimitStayTokenAccess({
    tokenPrefix,
    ip,
    kind: "verification",
  });
  if (!rl.allowed) {
    return {
      ok: false,
      error:
        "Too many attempts. Wait a few minutes and try again — or contact concierge.",
    };
  }

  const result = await verifyStayAccessCode({
    token: parsed.data.token,
    code: parsed.data.code,
    ipHash: rl.ipHash,
    userAgent: ua,
  });
  if (result.ok) {
    redirect(`/stay/${parsed.data.token}`);
  }
  if (result.reason === "exhausted") {
    return {
      ok: false,
      error:
        "Too many wrong attempts. Tap 'Send a new code' to start over, or contact concierge.",
    };
  }
  if (result.reason === "expired") {
    return {
      ok: false,
      error: "Code expired. Tap 'Send a new code' to get a fresh one.",
    };
  }
  if (result.reason === "no_pending_verification") {
    return {
      ok: false,
      error:
        "Your stay has no pending verification. Tap 'Send a new code' to start.",
    };
  }
  if (result.reason === "already_verified") {
    redirect(`/stay/${parsed.data.token}`);
  }
  if (result.reason === "token_not_found") {
    return { ok: false, error: "We couldn't verify your stay link." };
  }
  return {
    ok: false,
    error:
      result.attemptsRemaining !== undefined
        ? `That code didn't match. ${result.attemptsRemaining} ${result.attemptsRemaining === 1 ? "attempt" : "attempts"} left.`
        : "That code didn't match. Try again.",
  };
}

export async function issueStayVerificationAction(
  _prev: VerifyActionState | null,
  formData: FormData,
): Promise<VerifyActionState> {
  const parsed = issueSchema.safeParse({
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid stay link." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Service is unavailable." };
  const tokenHash = hashStayToken(parsed.data.token);
  const [tokenRow] = await db
    .select()
    .from(guestStayTokens)
    .where(eq(guestStayTokens.tokenHash, tokenHash))
    .limit(1);
  if (!tokenRow) {
    return { ok: false, error: "We couldn't verify your stay link." };
  }
  if (tokenRow.status !== "active") {
    return { ok: false, error: "This stay link is no longer active." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;
  const ipHash = hashIpForLog(ip) ?? null;

  const issued = await issueVerificationCode({
    guestStayTokenId: tokenRow.id,
    ipHash,
    userAgent: ua,
  });
  if (!issued.ok) {
    if (issued.reason === "cooldown") {
      const seconds = Math.ceil((issued.retryAfterMs ?? 60_000) / 1000);
      return {
        ok: false,
        error: `Please wait ${seconds}s before requesting another code.`,
      };
    }
    return { ok: false, error: "Couldn't send a new code. Contact concierge." };
  }
  // Dev fallback: bounce the code back to the UI so testing without a
  // configured provider still works. Production never sets this.
  return {
    ok: true,
    redirectTo: `/stay/${parsed.data.token}/verify`,
    ...(issued.devCodePreview && { codePreview: issued.devCodePreview }),
  } as VerifyActionState;
}

/** Admin-side cancel — used by the booking detail page when revoking a token. */
export async function adminCancelVerificationsAction(
  guestStayTokenId: string,
): Promise<void> {
  await cancelPendingVerifications(guestStayTokenId);
}
