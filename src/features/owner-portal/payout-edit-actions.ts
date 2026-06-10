"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { payoutMethods } from "@/lib/db/schema/ownership";
import { requireOwnerWrite } from "@/features/owner-portal/require-owner-write";
import { recordAuditEvent } from "@/features/audit/services";
import type {
  PayoutCodeState,
  PayoutEditView,
  PayoutSaveState,
} from "@/features/owner-portal/payout-edit-types";

/**
 * 2FA-gated owner payout-method edit.
 *
 * Genuinely-missing surface: /owner/preferences showed the payout
 * method as a read-only row with a disabled "Change method" button
 * ("Editing requires 2FA"). The gate was never built. This wires it.
 *
 * No owner_2fa / verification-code table exists in the repo, so the
 * gate is a server-verified CONFIRMATION-STEP (per the build spec's
 * "else a confirm-step gate"): step 1 generates a 6-digit code, stores
 * only a salted hash + short expiry in an httpOnly, owner-scoped cookie,
 * and surfaces the code to the owner (no SMS/email transport is wired —
 * PSP/notification transports are deferred). Step 2 re-enters the code;
 * the bank change only commits when the hash + owner + expiry all match.
 * When real 2FA infra lands, swap the cookie store for it — the action
 * boundary is unchanged.
 *
 * Owner-scoped: requireOwnerWrite returns the only ownerId this session
 * may write for (impersonating super-admins are read-only); the cookie
 * is bound to that ownerId so a stolen code can't be replayed for
 * another owner. No money columns are touched — payout_methods only
 * stores routing metadata (masked tail), settlement stays manual.
 */

const COOKIE_NAME = "__arconique_owner_payout_chal";
const CODE_TTL_SECONDS = 600; // 10 minutes
const HASH_SALT = "arconique.owner.payout.challenge.v1";
/**
 * Brute-force guard: a 6-digit code is a 1-in-1,000,000 space, so without a
 * cap an attacker could try every code inside the 10-minute window. Cap the
 * wrong-code attempts per issued challenge; once exhausted the cookie is
 * burned and the owner must request a fresh code (which regenerates the
 * secret, resetting the space). 5 tries keeps the legit fat-finger UX while
 * making the search statistically hopeless.
 */
const MAX_CODE_ATTEMPTS = 5;

function hashChallenge(ownerId: string, code: string, expEpoch: number): string {
  return createHash("sha256")
    .update(`${HASH_SALT}:${ownerId}:${code}:${expEpoch}`)
    .digest("hex");
}

function burnChallengeCookie(
  store: Awaited<ReturnType<typeof cookies>>,
): void {
  store.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Pre-fill data for the edit form (no secrets — masked tail only). */
export async function getPayoutEditView(): Promise<PayoutEditView | null> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return null;

  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      methodType: payoutMethods.methodType,
      currency: payoutMethods.currency,
      accountLabel: payoutMethods.accountLabel,
      bankName: payoutMethods.bankName,
      accountLast4: payoutMethods.accountLast4,
    })
    .from(payoutMethods)
    .where(eq(payoutMethods.ownerId, auth.ownerId))
    .orderBy(desc(payoutMethods.isDefault), desc(payoutMethods.updatedAt))
    .limit(1);

  if (!row) {
    return {
      hasMethod: false,
      methodType: "bank_intl",
      currency: "USD",
      accountLabel: "",
      bankName: "",
      maskedAccount: "••••0000",
    };
  }

  const mt =
    row.methodType === "bank_idr" || row.methodType === "wise"
      ? row.methodType
      : "bank_intl";

  return {
    hasMethod: true,
    methodType: mt,
    currency: row.currency,
    accountLabel: row.accountLabel,
    bankName: row.bankName ?? "",
    maskedAccount: `••••${row.accountLast4 ?? "0000"}`,
  };
}

/**
 * Step 1 — request the confirmation code that gates the payout edit.
 * Stores only a hash + expiry in an owner-scoped httpOnly cookie.
 */
export async function requestPayoutEditCodeAction(): Promise<PayoutCodeState> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expEpoch = Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS;
  // Payload: ownerId.expEpoch.remainingAttempts.hash — remainingAttempts is
  // the brute-force budget for THIS issued code and is decremented on each
  // wrong guess (see updatePayoutMethodAction). It is not covered by the
  // hash (it isn't a secret), but the cookie is httpOnly + owner-bound so a
  // client can't tamper it to widen the budget.
  const payload = `${auth.ownerId}.${expEpoch}.${MAX_CODE_ATTEMPTS}.${hashChallenge(
    auth.ownerId,
    code,
    expEpoch,
  )}`;

  const store = await cookies();
  store.set({
    name: COOKIE_NAME,
    value: payload,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CODE_TTL_SECONDS,
  });

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    action: "owner.payout.edit_code_requested",
    entityType: "owner",
    entityId: auth.ownerId,
    after: { expiresAt: expEpoch },
  });

  return { ok: true, demoCode: code, expiresInSeconds: CODE_TTL_SECONDS };
}

const saveSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
  methodType: z.enum(["bank_idr", "bank_intl", "wise"]),
  currency: z.string().trim().min(3).max(3),
  accountLabel: z.string().trim().min(2, "Add an account label.").max(120),
  bankName: z.string().trim().max(120).optional().or(z.literal("")),
  accountNumber: z
    .string()
    .trim()
    .min(4, "Enter the account number.")
    .max(40),
});

/**
 * Step 2 — verify the confirmation code and persist the new payout method.
 * Upserts the owner's default payout_methods row inside a guarded write.
 */
export async function updatePayoutMethodAction(
  _prev: PayoutSaveState,
  formData: FormData,
): Promise<PayoutSaveState> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = saveSchema.safeParse({
    code: formData.get("code"),
    methodType: formData.get("methodType"),
    currency: formData.get("currency"),
    accountLabel: formData.get("accountLabel"),
    bankName: formData.get("bankName") ?? "",
    accountNumber: formData.get("accountNumber"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const d = parsed.data;

  // Verify the confirmation-code gate (server-side, owner-bound).
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) {
    return { ok: false, error: "Your confirmation step expired — request a new code." };
  }
  const [cookieOwnerId, expStr, attemptsStr, cookieHash] = raw.split(".");
  const expEpoch = Number(expStr);
  const remainingAttempts = Number(attemptsStr);
  if (
    cookieOwnerId !== auth.ownerId ||
    !Number.isFinite(expEpoch) ||
    !Number.isFinite(remainingAttempts) ||
    expEpoch < Math.floor(Date.now() / 1000)
  ) {
    return { ok: false, error: "Your confirmation step expired — request a new code." };
  }
  // Brute-force guard: if the budget for this challenge is already spent,
  // invalidate it and force a fresh code instead of accepting another guess.
  if (remainingAttempts <= 0) {
    burnChallengeCookie(store);
    await recordAuditEvent({
      actorUserId: auth.appUserId,
      action: "owner.payout.edit_code_locked",
      entityType: "owner",
      entityId: auth.ownerId,
      after: { reason: "max_attempts_exhausted" },
    });
    return {
      ok: false,
      error: "Too many incorrect codes — request a new code to try again.",
    };
  }
  if (hashChallenge(auth.ownerId, d.code, expEpoch) !== cookieHash) {
    const left = remainingAttempts - 1;
    if (left <= 0) {
      // Last wrong guess — burn the cookie so the next attempt must start
      // over with a freshly generated secret.
      burnChallengeCookie(store);
      await recordAuditEvent({
        actorUserId: auth.appUserId,
        action: "owner.payout.edit_code_locked",
        entityType: "owner",
        entityId: auth.ownerId,
        after: { reason: "max_attempts_exhausted" },
      });
      return {
        ok: false,
        error: "Too many incorrect codes — request a new code to try again.",
      };
    }
    // Persist the decremented budget back to the cookie (same expiry).
    store.set({
      name: COOKIE_NAME,
      value: `${auth.ownerId}.${expEpoch}.${left}.${cookieHash}`,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.max(1, expEpoch - Math.floor(Date.now() / 1000)),
    });
    return {
      ok: false,
      error: `That code didn't match. ${left} attempt${left === 1 ? "" : "s"} left.`,
    };
  }

  const last4 = d.accountNumber.replace(/\s+/g, "").slice(-4);

  // Upsert the owner's default payout method. We never persist the full
  // account number — only the masked tail (settlement is manual; no PSP).
  const [existing] = await db
    .select({ id: payoutMethods.id })
    .from(payoutMethods)
    .where(
      and(
        eq(payoutMethods.ownerId, auth.ownerId),
        eq(payoutMethods.isDefault, true),
      ),
    )
    .orderBy(desc(payoutMethods.updatedAt))
    .limit(1);

  if (existing) {
    await db
      .update(payoutMethods)
      .set({
        methodType: d.methodType,
        currency: d.currency.toUpperCase(),
        accountLabel: d.accountLabel,
        bankName: d.bankName ? d.bankName : null,
        accountLast4: last4,
        updatedAt: new Date(),
      })
      .where(eq(payoutMethods.id, existing.id));
  } else {
    await db.insert(payoutMethods).values({
      ownerId: auth.ownerId,
      methodType: d.methodType,
      currency: d.currency.toUpperCase(),
      accountLabel: d.accountLabel,
      bankName: d.bankName ? d.bankName : null,
      accountLast4: last4,
      isDefault: true,
    });
  }

  // Burn the challenge — single use.
  burnChallengeCookie(store);

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    action: "owner.payout.update",
    entityType: "owner",
    entityId: auth.ownerId,
    after: {
      methodType: d.methodType,
      currency: d.currency.toUpperCase(),
      accountLabel: d.accountLabel,
      accountLast4: last4,
    },
  });

  revalidatePath("/owner/preferences");
  revalidatePath("/owner/preferences/payout");
  return { ok: true };
}
