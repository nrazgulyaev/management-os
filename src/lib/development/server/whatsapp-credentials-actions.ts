"use server";

/**
 * Stage 6.P5.F — WhatsApp credential CRUD (Tier 3 P3.6 closure).
 *
 * Operator-facing add/edit/disable for `whatsapp_phone_numbers` and
 * register/approve for `whatsapp_message_templates`.
 *
 * Lives in its own file with `"use server"` because the existing
 * `whatsapp-actions.ts` uses `import "server-only"` (so it can't be
 * imported by client form components — Stage 5.J build-fix invariant).
 *
 * Mutation guard: requires `requireInternalUser()` + an admin-tier
 * role. Phone-number rows are global (not org-scoped) so the guard
 * is the only protection there; template rows ARE org-scoped (the
 * list reader filters by `organization_id`) so template inserts stamp
 * the caller's org via `requireOrgId()` — never a client-supplied id.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import {
  whatsappPhoneNumbers,
  whatsappMessageTemplates,
} from "@/lib/db/schema/whatsapp";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

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
  // The list reader (getWhatsappPhoneNumbers) strict-filters organization_id,
  // so a row inserted with NULL org would never render. Stamp the caller's org.
  const orgId = await requireOrgId();
  const db = requireDb();
  const [row] = await db
    .insert(whatsappPhoneNumbers)
    .values({
      organizationId: orgId,
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
  revalidatePath("/development-os/whatsapp/phone-numbers");
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
  const orgId = await requireOrgId();
  await db
    .update(whatsappPhoneNumbers)
    .set(patch)
    .where(
      and(
        eq(whatsappPhoneNumbers.id, id),
        eq(whatsappPhoneNumbers.organizationId, orgId),
      ),
    );
  revalidatePath("/development-os/settings/whatsapp");
  revalidatePath("/development-os/whatsapp/phone-numbers");
}

export async function setWhatsappPhoneNumberActive(input: {
  id: string;
  isActive: boolean;
}): Promise<void> {
  const user = await requireInternalUser();
  ensureAdmin(user.roles);
  const orgId = await requireOrgId();
  const db = requireDb();
  await db
    .update(whatsappPhoneNumbers)
    .set({ isActive: input.isActive, updatedAt: new Date() })
    .where(
      and(
        eq(whatsappPhoneNumbers.id, input.id),
        eq(whatsappPhoneNumbers.organizationId, orgId),
      ),
    );
  revalidatePath("/development-os/settings/whatsapp");
  revalidatePath("/development-os/whatsapp/phone-numbers");
}

export async function markWhatsappPhoneNumberVerified(input: {
  id: string;
}): Promise<void> {
  const user = await requireInternalUser();
  ensureAdmin(user.roles);
  const orgId = await requireOrgId();
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
        eq(whatsappPhoneNumbers.organizationId, orgId),
        eq(whatsappPhoneNumbers.isActive, true),
      ),
    );
  revalidatePath("/development-os/settings/whatsapp");
  revalidatePath("/development-os/whatsapp/phone-numbers");
}

/**
 * Resolve an unknown inbound number to a known platform entity. The
 * phone-resolver canonicalises `resolved_entity_type` to one of
 * app_user | investor | vendor | contact; resolving also promotes the
 * registry row from `unknown` → `recipient`. Passing `null` clears the
 * resolution (back to `unknown`).
 */
const RESOLVE_ENTITY_TYPES = [
  "app_user",
  "investor",
  "vendor",
  "contact",
] as const;

const resolvePhoneSchema = z.object({
  id: z.string().uuid(),
  resolvedEntityType: z.enum(RESOLVE_ENTITY_TYPES).nullable(),
  resolvedEntityId: z.string().uuid().nullable(),
  displayName: z.string().max(128).nullable().optional(),
});

export async function resolvePhoneNumber(
  input: z.input<typeof resolvePhoneSchema>,
): Promise<void> {
  const user = await requireInternalUser();
  ensureAdmin(user.roles);
  const parsed = resolvePhoneSchema.parse(input);
  // Both halves must be present together, or both cleared.
  if (
    (parsed.resolvedEntityType === null) !==
    (parsed.resolvedEntityId === null)
  ) {
    throw new Error(
      "Resolve phone: entity type and entity id must be set together (or both cleared)",
    );
  }
  const orgId = await requireOrgId();
  const db = requireDb();
  const targetType = parsed.resolvedEntityType === null ? "unknown" : "recipient";
  const patch: Record<string, unknown> = {
    resolvedEntityType: parsed.resolvedEntityType,
    resolvedEntityId: parsed.resolvedEntityId,
    // Resolving promotes an unknown number to a recipient; clearing demotes
    // it back to unknown — but NEVER touch an arconique_outbound/inbound row
    // (that would corrupt the send-from registry resolveOutboundFromPhone uses).
    numberType: sql`CASE
      WHEN ${whatsappPhoneNumbers.numberType} IN ('unknown', 'recipient')
        THEN ${targetType}
      ELSE ${whatsappPhoneNumbers.numberType}
    END`,
    updatedAt: new Date(),
  };
  if (parsed.displayName !== undefined) {
    patch.displayName = parsed.displayName;
  }
  await db
    .update(whatsappPhoneNumbers)
    .set(patch)
    .where(
      and(
        eq(whatsappPhoneNumbers.id, parsed.id),
        eq(whatsappPhoneNumbers.organizationId, orgId),
      ),
    );
  revalidatePath("/development-os/settings/whatsapp");
  revalidatePath("/development-os/whatsapp/phone-numbers");
}

// =========================================================================
// WhatsApp message templates — register / edit / approval lifecycle.
//
// Templates ARE org-scoped (the list reader filters `organization_id`),
// so inserts stamp the caller's org via requireOrgId(). The unique
// constraint is on `template_key` (global), so a duplicate key throws.
// =========================================================================

const TEMPLATE_LANGS = ["en", "ru", "id", "zh"] as const;

const languageVersionSchema = z.object({
  body: z.string().min(1).max(4000),
  header: z.string().max(200).optional(),
});

const upsertTemplateSchema = z.object({
  templateKey: z
    .string()
    .min(1)
    .max(200)
    .regex(
      /^[a-z0-9_]+$/,
      "Template key must be lowercase letters, digits, and underscores",
    ),
  displayName: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  languageVersions: z
    .record(z.string(), languageVersionSchema)
    .refine((v) => Object.keys(v).length > 0, {
      message: "At least one language version is required",
    })
    .refine(
      (v) =>
        Object.keys(v).every((k) =>
          (TEMPLATE_LANGS as readonly string[]).includes(k),
        ),
      { message: "Unsupported language code in template" },
    ),
  expectedVariables: z.array(z.string().max(64)).nullable().optional(),
  notificationEventType: z.string().max(200).nullable().optional(),
  twilioTemplateSid: z.string().max(64).nullable().optional(),
  metaTemplateId: z.string().max(128).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function createWhatsappTemplate(
  input: z.input<typeof upsertTemplateSchema>,
): Promise<{ id: string }> {
  const user = await requireInternalUser();
  ensureAdmin(user.roles);
  const parsed = upsertTemplateSchema.parse(input);
  const orgId = await requireOrgId();
  const db = requireDb();
  const [row] = await db
    .insert(whatsappMessageTemplates)
    .values({
      organizationId: orgId,
      templateKey: parsed.templateKey,
      displayName: parsed.displayName,
      description: parsed.description ?? null,
      languageVersions:
        parsed.languageVersions as typeof whatsappMessageTemplates.$inferInsert["languageVersions"],
      expectedVariables: parsed.expectedVariables ?? null,
      notificationEventType: parsed.notificationEventType ?? null,
      twilioTemplateSid: parsed.twilioTemplateSid ?? null,
      metaTemplateId: parsed.metaTemplateId ?? null,
      notes: parsed.notes ?? null,
      approvalStatus: "draft",
      isActive: true,
      createdBy: user.appUser?.id ?? null,
    })
    .returning({ id: whatsappMessageTemplates.id });
  revalidatePath("/development-os/whatsapp/templates");
  return { id: row.id };
}

export async function updateWhatsappTemplate(
  id: string,
  input: Partial<z.input<typeof upsertTemplateSchema>>,
): Promise<void> {
  const user = await requireInternalUser();
  ensureAdmin(user.roles);
  const parsed = upsertTemplateSchema.partial().parse(input);
  const orgId = await requireOrgId();
  const db = requireDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.displayName !== undefined) patch.displayName = parsed.displayName;
  if (parsed.description !== undefined) patch.description = parsed.description;
  if (parsed.languageVersions !== undefined)
    patch.languageVersions = parsed.languageVersions;
  if (parsed.expectedVariables !== undefined)
    patch.expectedVariables = parsed.expectedVariables;
  if (parsed.notificationEventType !== undefined)
    patch.notificationEventType = parsed.notificationEventType;
  if (parsed.twilioTemplateSid !== undefined)
    patch.twilioTemplateSid = parsed.twilioTemplateSid;
  if (parsed.metaTemplateId !== undefined)
    patch.metaTemplateId = parsed.metaTemplateId;
  if (parsed.notes !== undefined) patch.notes = parsed.notes;
  await db
    .update(whatsappMessageTemplates)
    .set(patch)
    .where(
      and(
        eq(whatsappMessageTemplates.id, id),
        eq(whatsappMessageTemplates.organizationId, orgId),
      ),
    );
  revalidatePath("/development-os/whatsapp/templates");
}

/**
 * Advance a template through its approval lifecycle. `approved`
 * records the Twilio Content SID (Meta-approved templates are sent via
 * ContentSid); `rejected` records a reason. Only an approved + active
 * template can be sent by `sendWhatsAppTemplateMessage`.
 */
const TEMPLATE_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "inactive",
] as const;

const setTemplateStatusSchema = z
  .object({
    id: z.string().uuid(),
    approvalStatus: z.enum(TEMPLATE_STATUSES),
    twilioTemplateSid: z.string().max(64).nullable().optional(),
    rejectionReason: z.string().max(1000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.approvalStatus !== "approved" ||
      (v.twilioTemplateSid != null && v.twilioTemplateSid.trim().length > 0),
    {
      message:
        "Approving a template requires its Twilio Content SID (HX…) so it can be sent",
      path: ["twilioTemplateSid"],
    },
  );

export async function setTemplateApprovalStatus(
  input: z.input<typeof setTemplateStatusSchema>,
): Promise<void> {
  const user = await requireInternalUser();
  ensureAdmin(user.roles);
  const parsed = setTemplateStatusSchema.parse(input);
  const orgId = await requireOrgId();
  const db = requireDb();
  const patch: Record<string, unknown> = {
    approvalStatus: parsed.approvalStatus,
    updatedAt: new Date(),
  };
  if (parsed.approvalStatus === "approved") {
    patch.twilioTemplateSid = parsed.twilioTemplateSid;
    patch.approvedAt = new Date();
    patch.rejectionReason = null;
    patch.isActive = true;
  } else if (parsed.approvalStatus === "rejected") {
    patch.rejectionReason = parsed.rejectionReason ?? null;
    patch.approvedAt = null;
  } else {
    // draft / pending_approval / inactive — keep an already-recorded
    // SID if one was passed, but never require it.
    if (parsed.twilioTemplateSid !== undefined)
      patch.twilioTemplateSid = parsed.twilioTemplateSid;
    if (parsed.approvalStatus === "inactive") patch.isActive = false;
  }
  await db
    .update(whatsappMessageTemplates)
    .set(patch)
    .where(
      and(
        eq(whatsappMessageTemplates.id, parsed.id),
        eq(whatsappMessageTemplates.organizationId, orgId),
      ),
    );
  revalidatePath("/development-os/whatsapp/templates");
}
