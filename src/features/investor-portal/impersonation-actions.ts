"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { investors } from "@/lib/db/schema/investor-capital";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { IMPERSONATION_COOKIE } from "./investor-context";

/**
 * INVESTOR-AUTH — Investor impersonation actions.
 * Mirrors OWNER-PORTAL-1A impersonation pattern.
 */

const MAX_AGE_SECONDS = 60 * 60 * 8;

interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireSuperAdmin(): Promise<void> {
  const ctx = await getCurrentUserContext();
  if (!ctx.appUser) throw new Error("Sign in required");
  if (!ctx.isSuperAdmin) throw new Error("Only super_admin can impersonate investors");
}

export async function startImpersonatingInvestor(investorId: string): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
    const db = getDb();
    if (!db) return { ok: false, error: "DB not configured" };
    const [inv] = await db
      .select({ id: investors.id })
      .from(investors)
      .where(eq(investors.id, investorId))
      .limit(1);
    if (!inv) return { ok: false, error: "Investor not found" };

    const store = await cookies();
    store.set({
      name: IMPERSONATION_COOKIE,
      value: inv.id,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  redirect("/investor-portal");
}

export async function stopImpersonatingInvestor(): Promise<void> {
  const store = await cookies();
  store.set({
    name: IMPERSONATION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  redirect("/dashboard/investors");
}
