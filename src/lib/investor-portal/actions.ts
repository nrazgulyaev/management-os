import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { getSupabaseServer } from "@/lib/supabase/server";
import { investors } from "@/lib/db/schema/investor-capital";
import { REPORTING_LANGUAGES } from "@/lib/development/constants/investor-constants";
import { requireInvestorSession } from "./session";

/**
 * Investor portal write actions — narrowly scoped to the calling
 * investor's own account. Two surfaces are functional in 2.3.D:
 *
 *   - `updateMyReportingLanguage(language)` — changes the investor's
 *     `reporting_language` so the portal UI re-renders in their
 *     preferred language on next request.
 *
 *   - `updateMyPassword(newPassword)` — proxies to Supabase Auth
 *     `updateUser({ password })` which itself enforces session
 *     validation. Local server-side validation also runs (length +
 *     complexity).
 *
 * Both actions require an active investor session; both filter
 * writes by `session.investorId` so a hijacked Investor A session
 * cannot mutate Investor B's row even if the request body lies.
 */

const langSchema = z.object({
  language: z.enum(REPORTING_LANGUAGES),
});

export async function updateMyReportingLanguage(
  input: z.input<typeof langSchema>,
): Promise<{ updated: true; language: string }> {
  const parsed = langSchema.parse(input);
  const session = await requireInvestorSession();
  const db = requireDb();
  await db
    .update(investors)
    .set({ reportingLanguage: parsed.language, updatedAt: new Date() })
    .where(eq(investors.id, session.investorId));
  return { updated: true, language: parsed.language };
}

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(256)
  .refine((p) => /[A-Z]/.test(p), "Must contain an uppercase letter")
  .refine((p) => /[a-z]/.test(p), "Must contain a lowercase letter")
  .refine((p) => /[0-9]/.test(p), "Must contain a number");

export async function updateMyPassword(input: {
  newPassword: string;
}): Promise<{ updated: true }> {
  const newPassword = passwordSchema.parse(input.newPassword);
  // Verifies the investor is signed in and resolves the auth user via
  // the same path Supabase uses — the Supabase update below would also
  // fail without a valid session, but the explicit check gives a
  // clearer 401.
  await requireInvestorSession();

  const supabase = await getSupabaseServer();
  if (!supabase) {
    throw new Error("Supabase auth not configured");
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(`Password update failed: ${error.message}`);
  return { updated: true };
}
