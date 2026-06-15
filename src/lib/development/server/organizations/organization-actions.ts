"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import { requireSuperAdmin } from "@/features/auth/require-super-admin";

const createSchema = z.object({
  organizationCode: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[A-Z0-9_]+$/, "UPPER_SNAKE_CASE only"),
  name: z.string().min(2).max(120),
  organizationType: z.enum([
    "arconique_internal",
    "developer_client",
    "partner_organization",
    "demo_test",
    "archived",
  ]),
  countryCode: z.string().default("ID"),
  primaryCurrency: z.string().default("IDR"),
  primaryLanguage: z.string().default("en"),
  timezone: z.string().default("Asia/Makassar"),
  subscriptionTier: z
    .enum(["internal", "starter", "professional", "enterprise", "custom"])
    .default("starter"),
  enabledModules: z.array(z.string()).default([]),
});

export async function createOrganization(input: z.input<typeof createSchema>) {
  await requireSuperAdmin();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .insert(organizations)
    .values({
      organizationCode: parsed.data.organizationCode,
      name: parsed.data.name,
      organizationType: parsed.data.organizationType,
      countryCode: parsed.data.countryCode,
      primaryCurrency: parsed.data.primaryCurrency,
      primaryLanguage: parsed.data.primaryLanguage,
      timezone: parsed.data.timezone,
      subscriptionTier: parsed.data.subscriptionTier,
      enabledModules: parsed.data.enabledModules as never,
    })
    .onConflictDoNothing({ target: organizations.organizationCode });
  return { ok: true as const };
}

const updateBrandingSchema = z.object({
  organizationCode: z.string(),
  brandingConfig: z.record(z.unknown()),
});

export async function updateOrganizationBranding(
  input: z.input<typeof updateBrandingSchema>,
) {
  await requireSuperAdmin();
  const parsed = updateBrandingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(organizations)
    .set({ brandingConfig: parsed.data.brandingConfig as never })
    .where(eq(organizations.organizationCode, parsed.data.organizationCode));
  return { ok: true as const };
}

const updateModulesSchema = z.object({
  organizationCode: z.string(),
  enabledModules: z.array(z.string()),
});

export async function updateOrganizationModules(
  input: z.input<typeof updateModulesSchema>,
) {
  await requireSuperAdmin();
  const parsed = updateModulesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(organizations)
    .set({ enabledModules: parsed.data.enabledModules as never })
    .where(eq(organizations.organizationCode, parsed.data.organizationCode));
  return { ok: true as const };
}

export async function archiveOrganization(args: {
  organizationCode: string;
  reason: string;
}) {
  await requireSuperAdmin();
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(organizations)
    .set({
      isActive: false,
      archivedAt: new Date(),
      archiveReason: args.reason,
    })
    .where(eq(organizations.organizationCode, args.organizationCode));
  return { ok: true as const };
}
