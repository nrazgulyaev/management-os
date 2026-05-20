"use server";

/**
 * P5.4.7 AGENT-KB-ACTIONS — server actions for the agent knowledge
 * base UI (upload, process, delete).
 *
 * Separation from `src/lib/agents/actions.ts`:
 *   - `actions.ts` covers the platform_agent_configs CRUD + Vault key
 *     lifecycle (P5.3.2).
 *   - This file is the document-pipeline surface (Phase 5 of P5.4).
 *
 * Storage path convention:
 *
 *   agent-knowledge-docs/agent/{agentId}/{documentId}.{ext}
 *
 * Path includes documentId (not just filename) so re-uploads with the
 * same name don't collide. The Storage object is removed on delete +
 * on processing failures that should not retain the source file.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { agentKnowledgeDocuments } from "@/lib/db/schema/agents";
import { requireSuperAdmin } from "@/features/auth/require-super-admin";
import { assertAgentEnvReady, AgentEnvNotReadyError } from "./env";
import { processDocument } from "./document-processor";

const STORAGE_BUCKET = "agent-knowledge-docs";

export interface KnowledgeActionResult {
  ok: boolean;
  documentId?: string;
  error?: string;
}

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);

const MAX_BYTES = 50 * 1024 * 1024;

export async function uploadAgentDocumentFromForm(
  formData: FormData,
): Promise<void> {
  // Form-action variant — server actions binding to <form action> can't
  // return objects to the client. We redirect with ?error/?uploaded.
  const agentId = String(formData.get("agentId") ?? "");
  const file = formData.get("file");
  // P5.4.POLISH.4 — optional org-scoped upload. Empty string OR
  // missing field = platform-global (organization_id=NULL).
  const rawOrg = String(formData.get("organizationId") ?? "").trim();
  const organizationId = rawOrg.length === 36 ? rawOrg : null;

  if (!agentId) throw new Error("agentId is required");
  if (!(file instanceof File)) throw new Error("file is required");

  const result = await uploadAndProcessAgentDocument({
    agentId,
    file,
    organizationId,
  });
  const target = `/platform/agents/${agentId}?tab=knowledge`;
  const { redirect } = await import("next/navigation");
  if (!result.ok) {
    redirect(`${target}&error=${encodeURIComponent(result.error ?? "upload failed")}`);
  }
  // Pipeline runs in the background; UI polling drives the status
  // transitions. We redirect immediately with `processing=…` so the
  // flash banner makes the async nature obvious.
  revalidatePath(target);
  redirect(`${target}&processing=${result.documentId}`);
}

export async function uploadAndProcessAgentDocument(input: {
  agentId: string;
  file: File;
  /** NULL = platform-global; any subscribed org retrieves these. */
  organizationId?: string | null;
}): Promise<KnowledgeActionResult> {
  const { agentId, file, organizationId = null } = input;
  try {
    const ctx = await requireSuperAdmin();
    const uploaderId = ctx.appUser?.id ?? null;

    if (file.size === 0) return { ok: false, error: "Empty file." };
    if (file.size > MAX_BYTES)
      return { ok: false, error: `File exceeds 50MB cap (${file.size} bytes).` };

    const mime = file.type || "text/plain";
    if (!ALLOWED_MIMES.has(mime)) {
      return { ok: false, error: `Unsupported MIME type: ${mime}` };
    }

    try {
      assertAgentEnvReady();
    } catch (e) {
      if (e instanceof AgentEnvNotReadyError) {
        return { ok: false, error: e.message };
      }
      throw e;
    }

    const db = requireDb();
    const admin = getSupabaseAdmin();
    if (!admin) return { ok: false, error: "Supabase admin client unavailable." };

    // Insert document row first so we have an id for the Storage path.
    const ext = extensionForMime(mime) ?? extensionFromFilename(file.name) ?? "bin";
    const [row] = await db
      .insert(agentKnowledgeDocuments)
      .values({
        agentId,
        organizationId,
        storagePath: "PENDING",
        filename: file.name.slice(0, 255),
        mimeType: mime,
        sizeBytes: file.size,
        processingStatus: "pending",
        uploadedBy: uploaderId,
      })
      .returning({ id: agentKnowledgeDocuments.id });

    const storagePath = `agent/${agentId}/${row.id}.${ext}`;

    // Upload to Storage
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buf, {
        contentType: mime,
        upsert: true,
      });

    if (upErr) {
      await db
        .delete(agentKnowledgeDocuments)
        .where(eq(agentKnowledgeDocuments.id, row.id));
      return { ok: false, error: `Storage upload failed: ${upErr.message}` };
    }

    await db
      .update(agentKnowledgeDocuments)
      .set({ storagePath })
      .where(eq(agentKnowledgeDocuments.id, row.id));

    // P5.4.POLISH.3 — background processing.
    //
    // Previously we awaited processDocument() inline, which blocked the
    // upload request for 10-60 seconds (large PDFs occasionally hit
    // the Vercel function timeout). Now we kick the pipeline as a
    // fire-and-forget promise and return immediately. The UI polls
    // the document row's `processing_status` every few seconds and
    // surfaces transitions to the user.
    //
    // Risk profile: the promise dies if the function instance is
    // recycled mid-process — but processDocument() is idempotent
    // (clears existing chunks for the document before re-inserting),
    // so a "Reprocess" button on failed rows recovers cleanly. For
    // truly large uploads (>5MB / >100 pages) a real queue is the
    // right answer; this MVP solves the 99% case.
    void processDocument(row.id).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await db
          .update(agentKnowledgeDocuments)
          .set({
            processingStatus: "failed",
            processingError: message.slice(0, 500),
          })
          .where(eq(agentKnowledgeDocuments.id, row.id));
      } catch (writeErr) {
        console.error(
          "[knowledge-actions] background pipeline failed AND status write failed:",
          writeErr,
        );
      }
    });

    return { ok: true, documentId: row.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Upload failed.",
    };
  }
}

export async function reprocessAgentDocumentFromForm(
  formData: FormData,
): Promise<void> {
  const documentId = String(formData.get("documentId") ?? "");
  const agentId = String(formData.get("agentId") ?? "");
  await requireSuperAdmin();
  await processDocument(documentId);
  revalidatePath(`/platform/agents/${agentId}?tab=knowledge`);
}

export async function deleteAgentDocumentFromForm(
  formData: FormData,
): Promise<void> {
  const documentId = String(formData.get("documentId") ?? "");
  const agentId = String(formData.get("agentId") ?? "");
  if (!documentId || !agentId) return;

  await requireSuperAdmin();
  const db = requireDb();
  const admin = getSupabaseAdmin();

  const [doc] = await db
    .select({ storagePath: agentKnowledgeDocuments.storagePath })
    .from(agentKnowledgeDocuments)
    .where(eq(agentKnowledgeDocuments.id, documentId))
    .limit(1);

  if (doc?.storagePath && doc.storagePath !== "PENDING" && admin) {
    await admin.storage.from(STORAGE_BUCKET).remove([doc.storagePath]);
  }

  // Chunks cascade via the FK; the row itself drops them.
  await db
    .delete(agentKnowledgeDocuments)
    .where(eq(agentKnowledgeDocuments.id, documentId));

  revalidatePath(`/platform/agents/${agentId}?tab=knowledge`);
}

function extensionForMime(mime: string): string | null {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "text/plain":
      return "txt";
    case "text/markdown":
      return "md";
    default:
      return null;
  }
}

function extensionFromFilename(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}
