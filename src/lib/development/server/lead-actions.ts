"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  contactInteractions,
  contactRoles,
  type ContactRole,
} from "@/lib/db/schema/contacts";
import { aiAssistantRuns } from "@/lib/db/schema/ai";
import { projects } from "@/lib/db/schema/projects";
import { unitTypes } from "@/lib/db/schema/development";
import { findOrCreateContact, getActiveLeadRole } from "./contacts";
import { LEAD_STATUSES, type LeadStatus } from "./leads";
import {
  generateLeadWelcomeDraft,
  regenerateLeadWelcomeDraft,
  SALES_ASSISTANT_KEY,
} from "@/lib/ai/agents/sales-assistant";
import { contacts } from "@/lib/db/schema/contacts";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";

const createLeadSchema = z
  .object({
    fullName: z.string().min(2).max(120),
    email: z
      .string()
      .email()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined)),
    phone: z
      .string()
      .min(5)
      .max(40)
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined)),
    preferredLanguage: z.string().min(2).max(10).default("en"),
    preferredCommunicationChannel: z
      .enum(["email", "whatsapp", "phone", "in_person"])
      .optional(),
    projectId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined)),
    sourceId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined)),
    agentId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined)),
    unitTypeInterestId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined)),
    initialMessage: z.string().max(2000).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((d) => d.email || d.phone, {
    message: "Either email or phone is required.",
    path: ["email"],
  });

export type CreateLeadResult =
  | { ok: true; contactRoleId: string; contactId: string; aiDraftQueued: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createLead(formData: FormData): Promise<CreateLeadResult> {
  const parsed = createLeadSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    preferredLanguage: formData.get("preferredLanguage") ?? "en",
    preferredCommunicationChannel:
      formData.get("preferredCommunicationChannel") || undefined,
    projectId: formData.get("projectId") ?? "",
    sourceId: formData.get("sourceId") ?? "",
    agentId: formData.get("agentId") ?? "",
    unitTypeInterestId: formData.get("unitTypeInterestId") ?? "",
    initialMessage: formData.get("initialMessage") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = getDb();
  if (!db) {
    return {
      ok: false,
      error:
        "Database is not configured in this environment. New leads cannot be created until DATABASE_URL is set.",
    };
  }
  const data = parsed.data;

  // 1. Find or create the contact (dedup by email/phone).
  const { contact } = await findOrCreateContact({
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    preferredLanguage: data.preferredLanguage,
    preferredCommunicationChannel: data.preferredCommunicationChannel,
  });

  // 2. Reject duplicate active lead in the same project.
  if (data.projectId) {
    const existing = await getActiveLeadRole(contact.id, data.projectId);
    if (existing) {
      return {
        ok: false,
        error: `${contact.fullName} already has an active lead role in this project (status: ${existing.status}).`,
      };
    }
  }

  // 3. Insert the lead role.
  const insertedRoles = await db
    .insert(contactRoles)
    .values({
      contactId: contact.id,
      role: "lead",
      scope: data.projectId ? "project" : "global",
      scopeProjectId: data.projectId ?? null,
      status: "new",
      sourceId: data.sourceId ?? null,
      agentId: data.agentId ?? null,
      unitTypeInterestId: data.unitTypeInterestId ?? null,
      notes: data.notes ?? null,
    })
    .returning();
  const role = insertedRoles[0];
  if (!role) return { ok: false, error: "Failed to create lead role." };

  // 4. Log the inbound interaction.
  await db.insert(contactInteractions).values({
    contactId: contact.id,
    projectId: data.projectId ?? null,
    interactionType: data.initialMessage ? "note" : "system_event",
    direction: data.initialMessage ? "inbound" : "internal_note",
    occurredAt: new Date(),
    subject: data.initialMessage ? "Initial inquiry" : "Lead created",
    body: data.initialMessage ?? "Lead created via Development OS new-lead form.",
    relatedRoleId: role.id,
    reviewStatus: "not_required",
  });

  // 5. Trigger the AI Sales Assistant draft (best effort, non-blocking).
  let aiDraftQueued = false;
  try {
    aiDraftQueued = await maybeQueueAIDraft({
      role,
      contact,
      projectId: data.projectId ?? null,
      unitTypeInterestId: data.unitTypeInterestId ?? null,
      acquisitionSource: contact.acquisitionSource,
      acquisitionSourceDetail: contact.acquisitionSourceDetail,
      initialMessage: data.initialMessage ?? null,
    });
  } catch {
    // Never let AI failure block lead creation.
    aiDraftQueued = false;
  }

  revalidatePath(`${DEVELOPMENT_APP_PATH}/sales`);
  if (data.projectId) {
    const proj = await db
      .select({ slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .limit(1);
    if (proj[0]) {
      revalidatePath(`${DEVELOPMENT_APP_PATH}/projects/${proj[0].slug}`);
    }
  }

  return {
    ok: true,
    contactRoleId: role.id,
    contactId: contact.id,
    aiDraftQueued,
  };
}

async function maybeQueueAIDraft(args: {
  role: ContactRole;
  contact: {
    id: string;
    fullName: string;
    displayName: string | null;
    preferredLanguage: string;
    preferredCommunicationChannel: string | null;
    countryOfResidence: string | null;
    citizenship: string | null;
    acquisitionSource: string | null;
  };
  projectId: string | null;
  unitTypeInterestId: string | null;
  acquisitionSource: string | null;
  acquisitionSourceDetail: string | null;
  initialMessage: string | null;
}): Promise<boolean> {
  const db = getDb()!;

  let projectInfo: { name: string; location: string; slug: string } | null = null;
  if (args.projectId) {
    const [p] = await db
      .select({ name: projects.name, location: projects.location, slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, args.projectId))
      .limit(1);
    if (p) projectInfo = p;
  }

  let unitTypeInfo: { name: string } | null = null;
  if (args.unitTypeInterestId) {
    const [u] = await db
      .select({ name: unitTypes.name })
      .from(unitTypes)
      .where(eq(unitTypes.id, args.unitTypeInterestId))
      .limit(1);
    if (u) unitTypeInfo = u;
  }

  // Open an ai_assistant_runs row immediately so we have a stable id to link.
  const [run] = await db
    .insert(aiAssistantRuns)
    .values({
      assistantKey: SALES_ASSISTANT_KEY,
      runType: "draft",
      status: "running",
      inputSummary: `Lead welcome draft · contact=${args.contact.id}${args.projectId ? ` · project=${args.projectId}` : ""}`,
    })
    .returning();
  if (!run) return false;

  const result = await generateLeadWelcomeDraft({
    contact: {
      fullName: args.contact.fullName,
      displayName: args.contact.displayName,
      preferredLanguage: args.contact.preferredLanguage,
      preferredCommunicationChannel: args.contact.preferredCommunicationChannel,
      countryOfResidence: args.contact.countryOfResidence,
      citizenship: args.contact.citizenship,
    },
    project: projectInfo,
    unitTypeInterest: unitTypeInfo,
    acquisitionSource: args.acquisitionSource,
    acquisitionSourceDetail: args.acquisitionSourceDetail,
    initialMessage: args.initialMessage,
  });

  if (!result.ok) {
    await db
      .update(aiAssistantRuns)
      .set({
        status: result.reason === "unavailable" ? "skipped" : "error",
        errorMessage: result.message,
        latencyMs: result.durationMs,
        finishedAt: new Date(),
      })
      .where(eq(aiAssistantRuns.id, run.id));
    return false;
  }

  await db
    .update(aiAssistantRuns)
    .set({
      status: "success",
      model: result.model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      latencyMs: result.durationMs,
      outputSummary: truncateForLog(result.draft.subject + " — " + result.draft.body),
      finishedAt: new Date(),
    })
    .where(eq(aiAssistantRuns.id, run.id));

  // Persist the draft as a contact_interactions row in `pending` review state.
  await db.insert(contactInteractions).values({
    contactId: args.contact.id,
    projectId: args.projectId,
    interactionType: "ai_draft",
    direction: "internal_note",
    occurredAt: new Date(),
    subject: result.draft.subject,
    body: result.draft.body,
    aiSummary: result.draft.qualificationReasoning,
    aiActionItems: [
      {
        text: `Suggested follow-up: ${result.draft.followUp.channel} in ~${result.draft.followUp.etaHours}h`,
        reasoning: result.draft.followUp.reasoning,
      },
    ],
    aiGeneratedAt: new Date(),
    aiModel: result.model,
    aiRunId: run.id,
    reviewStatus: "pending",
    relatedRoleId: args.role.id,
  });

  return true;
}

function truncateForLog(s: string): string {
  return s.length > 480 ? s.slice(0, 480) + "…" : s;
}

// -----------------------------------------------------------------------------
// Status transitions
// -----------------------------------------------------------------------------

const updateStatusSchema = z.object({
  contactRoleId: z.string().uuid(),
  newStatus: z.enum(LEAD_STATUSES as unknown as [LeadStatus, ...LeadStatus[]]),
  notes: z.string().max(2000).optional(),
});

export async function updateLeadStatus(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = updateStatusSchema.safeParse({
    contactRoleId: formData.get("contactRoleId"),
    newStatus: formData.get("newStatus"),
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid input." };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const isTerminal = parsed.data.newStatus === "lost" || parsed.data.newStatus === "contract_signed";
  await db
    .update(contactRoles)
    .set({
      status: parsed.data.newStatus,
      endedAt: isTerminal ? new Date() : null,
      endReason: isTerminal
        ? parsed.data.newStatus === "lost"
          ? "lost"
          : "converted"
        : null,
      notes: parsed.data.notes ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(contactRoles.id, parsed.data.contactRoleId));

  await db.insert(contactInteractions).values({
    contactId: (
      await db
        .select({ contactId: contactRoles.contactId })
        .from(contactRoles)
        .where(eq(contactRoles.id, parsed.data.contactRoleId))
        .limit(1)
    )[0].contactId,
    interactionType: "system_event",
    direction: "internal_note",
    occurredAt: new Date(),
    subject: `Status → ${parsed.data.newStatus}`,
    body: parsed.data.notes ?? `Lead moved to ${parsed.data.newStatus}.`,
    relatedRoleId: parsed.data.contactRoleId,
    reviewStatus: "not_required",
  });

  revalidatePath(`${DEVELOPMENT_APP_PATH}/sales`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// AI draft review actions
// -----------------------------------------------------------------------------

const reviewDraftSchema = z.object({
  draftId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  finalSubject: z.string().max(200).optional(),
  finalBody: z.string().max(8000).optional(),
  reviewNotes: z.string().max(2000).optional(),
});

export async function reviewAIDraft(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = reviewDraftSchema.safeParse({
    draftId: formData.get("draftId"),
    decision: formData.get("decision"),
    finalSubject: formData.get("finalSubject") ?? undefined,
    finalBody: formData.get("finalBody") ?? undefined,
    reviewNotes: formData.get("reviewNotes") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  await db
    .update(contactInteractions)
    .set({
      subject:
        parsed.data.decision === "approved" && parsed.data.finalSubject
          ? parsed.data.finalSubject
          : undefined,
      body:
        parsed.data.decision === "approved" && parsed.data.finalBody
          ? parsed.data.finalBody
          : undefined,
      reviewStatus: parsed.data.decision,
      reviewedAt: new Date(),
      reviewNotes: parsed.data.reviewNotes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(contactInteractions.id, parsed.data.draftId));

  revalidatePath(`${DEVELOPMENT_APP_PATH}/sales`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// AI: Regenerate draft
// -----------------------------------------------------------------------------

const regenerateSchema = z.object({
  draftId: z.string().uuid(),
  instruction: z.string().max(500).optional(),
});

export type RegenerateDraftResult =
  | { ok: true; newDraftId: string }
  | { ok: false; error: string };

/**
 * Regenerates an AI welcome draft. The original draft is left intact (and
 * gets `review_notes` annotated with "regenerated → <newDraftId>"); a new
 * draft row is created at `review_status='pending'` so the reviewer can
 * compare side-by-side.
 */
export async function regenerateAIDraft(
  formData: FormData,
): Promise<RegenerateDraftResult> {
  const parsed = regenerateSchema.safeParse({
    draftId: formData.get("draftId"),
    instruction: formData.get("instruction") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // Load original draft + contact context.
  const drafts = await db
    .select()
    .from(contactInteractions)
    .where(eq(contactInteractions.id, parsed.data.draftId))
    .limit(1);
  const original = drafts[0];
  if (!original)
    return { ok: false, error: "Original draft not found." };
  if (original.interactionType !== "ai_draft") {
    return {
      ok: false,
      error: "Only ai_draft interactions can be regenerated.",
    };
  }

  const contactRow = (
    await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, original.contactId))
      .limit(1)
  )[0];
  if (!contactRow) return { ok: false, error: "Contact not found." };

  // Open a new aiAssistantRuns row.
  const [run] = await db
    .insert(aiAssistantRuns)
    .values({
      assistantKey: SALES_ASSISTANT_KEY,
      runType: "draft",
      status: "running",
      inputSummary: `Regenerate draft ${parsed.data.draftId}`,
    })
    .returning();
  if (!run) return { ok: false, error: "Could not open AI run row." };

  const result = await regenerateLeadWelcomeDraft({
    base: {
      contact: {
        fullName: contactRow.fullName,
        displayName: contactRow.displayName,
        preferredLanguage: contactRow.preferredLanguage,
        preferredCommunicationChannel: contactRow.preferredCommunicationChannel,
        countryOfResidence: contactRow.countryOfResidence,
        citizenship: contactRow.citizenship,
      },
      acquisitionSource: contactRow.acquisitionSource,
      acquisitionSourceDetail: contactRow.acquisitionSourceDetail,
    },
    previousDraftBody: original.body ?? "",
    reviewerInstruction: parsed.data.instruction,
  });

  if (!result.ok) {
    await db
      .update(aiAssistantRuns)
      .set({
        status: result.reason === "unavailable" ? "skipped" : "error",
        errorMessage: result.message,
        latencyMs: result.durationMs,
        finishedAt: new Date(),
      })
      .where(eq(aiAssistantRuns.id, run.id));
    return { ok: false, error: result.message };
  }

  await db
    .update(aiAssistantRuns)
    .set({
      status: "success",
      model: result.model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      latencyMs: result.durationMs,
      outputSummary:
        (result.draft.subject + " — " + result.draft.body).slice(0, 480),
      finishedAt: new Date(),
    })
    .where(eq(aiAssistantRuns.id, run.id));

  // Insert new draft, link to original via review_notes.
  const inserted = await db
    .insert(contactInteractions)
    .values({
      contactId: original.contactId,
      projectId: original.projectId,
      interactionType: "ai_draft",
      direction: "internal_note",
      occurredAt: new Date(),
      subject: result.draft.subject,
      body: result.draft.body,
      aiSummary: result.draft.qualificationReasoning,
      aiActionItems: [
        {
          text: `Suggested follow-up: ${result.draft.followUp.channel} in ~${result.draft.followUp.etaHours}h`,
          reasoning: result.draft.followUp.reasoning,
        },
      ],
      aiGeneratedAt: new Date(),
      aiModel: result.model,
      aiRunId: run.id,
      reviewStatus: "pending",
      relatedRoleId: original.relatedRoleId,
      reviewNotes: parsed.data.instruction
        ? `Regenerated from ${original.id} · instruction: ${parsed.data.instruction}`
        : `Regenerated from ${original.id}`,
    })
    .returning({ id: contactInteractions.id });

  // Annotate original (without changing its review status).
  await db
    .update(contactInteractions)
    .set({
      reviewNotes: `Regenerated → ${inserted[0]?.id ?? "?"}`,
      updatedAt: new Date(),
    })
    .where(eq(contactInteractions.id, original.id));

  revalidatePath(`${DEVELOPMENT_APP_PATH}/sales`);
  return { ok: true, newDraftId: inserted[0]?.id ?? "" };
}
