import "server-only";

import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import { requireSuperAdmin } from "@/features/auth/require-super-admin";

/**
 * The legacy seed/default org code. Every non-platform caller
 * (requireOrgId fallback, webhooks, cron jobs, email sender) looks up
 * THIS specific literal — those paths are safe and must not be gated
 * behind super-admin (gating them would break requireOrgId's anonymous
 * fallback and every background job). Only the platform [code] page
 * passes a raw client-supplied code, so we require super-admin for any
 * lookup of a code other than this default.
 */
const DEFAULT_ORG_CODE = "ARCONIQUE_DEFAULT";

export async function listOrganizations() {
  // Tenant registry (codes/names/tiers/modules) — only the platform
  // pages render this; require super-admin so a dev-product tenant
  // cannot enumerate every other tenant.
  await requireSuperAdmin();
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(organizations)
    .orderBy(desc(organizations.isActive), organizations.name);
}

export async function getOrganizationByCode(code: string) {
  // The platform [code] page passes a raw client-supplied code, which
  // would otherwise let any dev tenant read another org's full
  // config/branding. Gate any non-default lookup behind super-admin
  // while leaving the safe literal-default callers untouched.
  if (code !== DEFAULT_ORG_CODE) {
    await requireSuperAdmin();
  }
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.organizationCode, code))
    .limit(1);
  return rows[0] ?? null;
}

export async function getOrganizationById(id: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  return rows[0] ?? null;
}
