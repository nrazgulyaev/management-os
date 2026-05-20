"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { owners } from "@/lib/db/schema/ownership";
import { requireSuperAdmin as requireSuperAdminCtx } from "@/features/auth/require-super-admin";
import { IMPERSONATION_COOKIE } from "./owner-context";

/**
 * OWNER-PORTAL-1A — Owner impersonation actions.
 *
 * Lets a super_admin "view as" any owner without needing a real
 * owner-role binding (DEMO-2 doesn't seed `app_users_owners` grants,
 * so impersonation is the only way to see the owner portal today).
 *
 * Cookie: `__arconique_owner_impersonation` — HttpOnly, Secure,
 * SameSite=Lax, session-only (no maxAge → cleared at browser close).
 * Validated on every read by re-checking the caller's super_admin
 * status; a stale cookie on a non-admin account is ignored.
 */

const MAX_AGE_SECONDS = 60 * 60 * 8; // 8h hard ceiling; cleared at browser close anyway.

interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireSuperAdmin(): Promise<void> {
  await requireSuperAdminCtx();
}

export async function startImpersonatingOwner(ownerId: string): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
    const db = getDb();
    if (!db) return { ok: false, error: "DB not configured" };
    const [owner] = await db
      .select({ id: owners.id })
      .from(owners)
      .where(eq(owners.id, ownerId))
      .limit(1);
    if (!owner) return { ok: false, error: "Owner not found" };

    const store = await cookies();
    store.set({
      name: IMPERSONATION_COOKIE,
      value: owner.id,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  redirect("/owner");
}

export async function stopImpersonating(): Promise<void> {
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
  redirect("/dashboard/owners");
}
