"use server";

/**
 * Stage 6.P5.F — WhatsApp credential CRUD (Tier 3 P3.6 closure).
 *
 * Operator-facing add/edit/disable for `whatsapp_phone_numbers`.
 * Lives in its own file with `"use server"` because the existing
 * `whatsapp-actions.ts` uses `import "server-only"` (so it can't be
 * imported by client form components — Stage 5.J build-fix invariant).
 *
 * Mutation guard: requires `requireInternalUser()` + an admin-tier
 * role. Phone-number rows are global (not org-scoped) so the guard
 * is the only protection.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { whatsappPhoneNumbers } from "@/lib/db/schema/whatsapp";
import { requireInternalUser } from "@/features/auth/permissions";

const NUMBER_TYPES = [
  "arconique_outbound",
  "arconique_inbound",
  "recipient",
  "unknown",
] as const;

const upsertPhoneSchema = z.object({
  phoneNumber: z.string().min(7).max(32),
  displayName: z.string().max(128).nullable().optional(),
  numberType: z.enum(NUMBER_TYPES),
  provider: z.string().min(1).default("twilio"),
  twilioPhoneSid: z.string().max(64).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

function ensureAdmin(roles: string[]): void {
  if (
    !roles.some((r) =>
      ["super_admin", "director", "system_admin", "ops_admin"].includes(r),
    )
  ) {
    throw new Error("WhatsApp credentials: admin role required");
  }
}

export async function createWhatsappPhoneNumber(
  input: z.input<typeof upsertPhoneSchema>,
): Promise<{ id: string }> {
  const user = await requireInternalUser();
  ensureAdmin(user.roles);
  const parsed = upsertPhoneSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(whatsappPhoneNumbers)
    .values({
      phoneNumber: parsed.phoneNumber,
      displayName: parsed.displayName ?? null,
      numberType: parsed.numberType,
      provider: parsed.provider ?? "twilio",
      twilioPhoneSid: parsed.twilioPhoneSid ?? null,
      notes: parsed.notes ?? null,
      isActive: true,
      isVerified: false,
      createdBy: user.appUser?.id ?? null,
    })
    .returning({ id: whatsappPhoneNumbers.id });
  revalidatePath("/development-os/settings/whatsapp");
  return { id: row.id };
}

export async function updateWhatsappPhoneNumber(
  id: string,
  input: Partial<z.input<typeof upsertPhoneSchema>>,
): Promise<void> {
  const user = await requireInternalUser();
  ensureAdmin(user.roles);
  const parsed = upsertPhoneSchema.partial().parse(input);
  const db = requireDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.phoneNumber !== undefined) patch.phoneNumber = parsed.phoneNumber;
  if (parsed.displayName !== undefined) patch.displayName = parsed.displayName;
  if (parsed.numberType !== undefined) patch.numberType = parsed.numberType;
  if (parsed.provider !== undefined) patch.provider = parsed.provider;
  if (parsed.twilioPhoneSid !== undefined)
    patch.twilioPhoneSid = parsed.twilioPhoneSid;
  if (parsed.notes !== undefined) patch.notes = parsed.notes;
  await db
    .update(whatsappPhoneNumbers)
    .set(patch)
    .where(eq(whatsappPhoneNumbers.id, id));
  revalidatePath("/development-os/settings/whatsapp");
}

export async function setWhatsappPhoneNumberActive(input: {
  id: string;
  isActive: boolean;
}): Promise<void> {
  const user = await requireInternalUser();
  ensureAdmin(user.roles);
  const db = requireDb();
  await db
    .update(whatsappPhoneNumbers)
    .set({ isActive: input.isActive, updatedAt: new Date() })
    .where(eq(whatsappPhoneNumbers.id, input.id));
  revalidatePath("/development-os/settings/whatsapp");
}

export async function markWhatsappPhoneNumberVerified(input: {
  id: string;
}): Promise<void> {
  const user = await requireInternalUser();
  ensureAdmin(user.roles);
  const db = requireDb();
  await db
    .update(whatsappPhoneNumbers)
    .set({
      isVerified: true,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(whatsappPhoneNumbers.id, input.id),
        eq(whatsappPhoneNumbers.isActive, true),
      ),
    );
  revalidatePath("/development-os/settings/whatsapp");
}
