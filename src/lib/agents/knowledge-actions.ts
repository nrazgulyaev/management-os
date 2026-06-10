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
import { and, eq, inArray, like } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  agentKnowledgeDocuments,
  orgAgentSubscriptions,
  platformAgentConfigs,
} from "@/lib/db/schema/agents";
import { documents } from "@/lib/db/schema/documents";
import { requireSuperAdmin } from "@/features/auth/require-super-admin";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
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

// ---------------------------------------------------------------------------
// DOCS-AI-FEED — org-scoped "feed a workspace document to an agent" path.
//
// The super-admin upload above serves Agent Studio. The two functions
// below are the tenant-safe variant powering the documents cabinet's
// "Feed to AI agent" loop. They follow the exact same pipeline
// (knowledge row → Storage upload → background processDocument) but:
//
//   · auth = canManageEntity("document") + the session org — the same
//     gate as every other documents-cabinet write. NEVER super-admin.
//   · the source document is resolved org-scoped by id; raw storage
//     paths are never accepted from the caller (no cross-tenant reads).
//   · provenance is encoded in the existing storage_path column:
//
//       agent/{agentId}/org-doc/{sourceDocumentId}/{knowledgeId}.{ext}      (full file copy)
//       agent/{agentId}/org-doc/{sourceDocumentId}/meta-{knowledgeId}.md    (metadata card)
//
//     which lets the documents cabinet list/remove assignments and show
//     per-agent doc counts without any schema change.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrgFeedResult {
  ok: boolean;
  knowledgeDocumentId?: string;
  /** "file" = full text copy; "metadata" = title/category/dates card only. */
  mode?: "file" | "metadata";
  agentName?: string;
  error?: string;
}

export async function feedOrgDocumentToAgentKnowledge(input: {
  agentId: string;
  documentId: string;
}): Promise<OrgFeedResult> {
  try {
    const { agentId, documentId } = input;
    if (!UUID_RE.test(agentId) || !UUID_RE.test(documentId)) {
      return { ok: false, error: "Invalid agent or document id." };
    }
    if (!(await canManageEntity("document"))) {
      return { ok: false, error: "Not authorised." };
    }
    const organizationId = await requireOrgId();
    const me = await getCurrentAppUser();

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

    // Agent must be active AND enabled for the caller's workspace.
    const [agent] = await db
      .select({
        id: platformAgentConfigs.id,
        displayName: platformAgentConfigs.displayName,
        isActive: platformAgentConfigs.isActive,
        subEnabled: orgAgentSubscriptions.isEnabled,
      })
      .from(platformAgentConfigs)
      .innerJoin(
        orgAgentSubscriptions,
        and(
          eq(orgAgentSubscriptions.agentId, platformAgentConfigs.id),
          eq(orgAgentSubscriptions.organizationId, organizationId),
        ),
      )
      .where(eq(platformAgentConfigs.id, agentId))
      .limit(1);
    if (!agent || !agent.isActive || !agent.subEnabled) {
      return {
        ok: false,
        error: "This agent isn't available to your workspace.",
      };
    }

    // Source document must belong to the caller's org.
    const [doc] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!doc) return { ok: false, error: "Document not found." };
    if (doc.status !== "active") {
      return {
        ok: false,
        error: "Archived documents can't be fed to agents.",
      };
    }

    // One knowledge copy per (agent, document).
    const marker = `%/org-doc/${documentId}/%`;
    const [existing] = await db
      .select({ id: agentKnowledgeDocuments.id })
      .from(agentKnowledgeDocuments)
      .where(
        and(
          eq(agentKnowledgeDocuments.agentId, agentId),
          eq(agentKnowledgeDocuments.organizationId, organizationId),
          like(agentKnowledgeDocuments.storagePath, marker),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        ok: false,
        error: "This document is already in that agent's knowledge base.",
      };
    }

    // Source the content. PDF / DOCX / text files are copied in full so
    // the pipeline extracts + embeds the real text. Anything else
    // (images, drawings, spreadsheets, file-less records) becomes a
    // small metadata card so the agent at least knows the document
    // exists and what it covers.
    const hasFile = Boolean(
      doc.storageBucket && doc.storagePath && doc.storageBucket !== "dry_run",
    );
    const extractable = hasFile && ALLOWED_MIMES.has(doc.mimeType ?? "");

    let mode: "file" | "metadata";
    let buf: Buffer;
    let mime: string;
    let filename: string;
    if (extractable && doc.storageBucket && doc.storagePath) {
      const { data: blob, error: dlErr } = await admin.storage
        .from(doc.storageBucket)
        .download(doc.storagePath);
      if (dlErr || !blob) {
        return {
          ok: false,
          error: `Couldn't read the stored file: ${dlErr?.message ?? "no data"}`,
        };
      }
      buf = Buffer.from(await blob.arrayBuffer());
      mime = doc.mimeType ?? "application/pdf";
      filename = (doc.fileName ?? doc.title).slice(0, 255);
      mode = "file";
    } else {
      buf = Buffer.from(buildDocumentMetadataCard(doc, hasFile), "utf8");
      mime = "text/markdown";
      filename = `${doc.title.slice(0, 220)} — metadata.md`;
      mode = "metadata";
    }

    if (buf.byteLength === 0) return { ok: false, error: "Empty file." };
    if (buf.byteLength > MAX_BYTES) {
      return {
        ok: false,
        error: `File exceeds the 50MB ingestion cap (${buf.byteLength} bytes).`,
      };
    }

    const [row] = await db
      .insert(agentKnowledgeDocuments)
      .values({
        agentId,
        organizationId,
        storagePath: "PENDING",
        filename,
        mimeType: mime,
        sizeBytes: buf.byteLength,
        processingStatus: "pending",
        uploadedBy: me?.id ?? null,
      })
      .returning({ id: agentKnowledgeDocuments.id });

    const ext =
      extensionForMime(mime) ?? extensionFromFilename(filename) ?? "bin";
    const storagePath = `agent/${agentId}/org-doc/${documentId}/${
      mode === "metadata" ? "meta-" : ""
    }${row.id}.${ext}`;

    const { error: upErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buf, { contentType: mime, upsert: true });
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

    // Same background pipeline + failure recovery as the super-admin
    // upload above (see P5.4.POLISH.3 note).
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
          "[knowledge-actions] org-doc pipeline failed AND status write failed:",
          writeErr,
        );
      }
    });

    return {
      ok: true,
      knowledgeDocumentId: row.id,
      mode,
      agentName: agent.displayName,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Feed failed.",
    };
  }
}

export interface OrgRemoveResult {
  ok: boolean;
  removedCount?: number;
  /** Knowledge rows other agents still hold for this document. */
  remainingForDocument?: number;
  error?: string;
}

export async function removeOrgDocumentFromAgentKnowledge(input: {
  agentId: string;
  documentId: string;
}): Promise<OrgRemoveResult> {
  try {
    const { agentId, documentId } = input;
    if (!UUID_RE.test(agentId) || !UUID_RE.test(documentId)) {
      return { ok: false, error: "Invalid agent or document id." };
    }
    if (!(await canManageEntity("document"))) {
      return { ok: false, error: "Not authorised." };
    }
    const organizationId = await requireOrgId();

    const db = requireDb();
    const admin = getSupabaseAdmin();

    const marker = `%/org-doc/${documentId}/%`;
    const rows = await db
      .select({
        id: agentKnowledgeDocuments.id,
        storagePath: agentKnowledgeDocuments.storagePath,
      })
      .from(agentKnowledgeDocuments)
      .where(
        and(
          eq(agentKnowledgeDocuments.agentId, agentId),
          eq(agentKnowledgeDocuments.organizationId, organizationId),
          like(agentKnowledgeDocuments.storagePath, marker),
        ),
      );
    if (rows.length === 0) {
      return {
        ok: false,
        error: "This document isn't in that agent's knowledge base.",
      };
    }

    const paths = rows
      .map((r) => r.storagePath)
      .filter((p) => p && p !== "PENDING");
    if (admin && paths.length > 0) {
      await admin.storage
        .from(STORAGE_BUCKET)
        .remove(paths)
        .catch(() => null);
    }

    // Chunks cascade via the FK.
    await db.delete(agentKnowledgeDocuments).where(
      inArray(
        agentKnowledgeDocuments.id,
        rows.map((r) => r.id),
      ),
    );

    const remaining = await db
      .select({ id: agentKnowledgeDocuments.id })
      .from(agentKnowledgeDocuments)
      .where(
        and(
          eq(agentKnowledgeDocuments.organizationId, organizationId),
          like(agentKnowledgeDocuments.storagePath, marker),
        ),
      );

    return {
      ok: true,
      removedCount: rows.length,
      remainingForDocument: remaining.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Remove failed.",
    };
  }
}

/**
 * Markdown card ingested when a document has no file or a file type the
 * extractor can't read yet. Honest scope: the agent learns the record
 * exists + its metadata — never invented file contents.
 */
function buildDocumentMetadataCard(
  doc: typeof documents.$inferSelect,
  hasFile: boolean,
): string {
  const fmt = (d: Date | null) =>
    d ? d.toISOString().slice(0, 10) : null;
  const lines = [
    `# ${doc.title}`,
    "",
    "Workspace document record from the Arconique document vault.",
    "",
    `- Category: ${doc.documentType}`,
    `- Linked to: ${doc.entityType} ${doc.entityId}`,
    `- File: ${hasFile ? `${doc.fileName ?? "attached file"} (${doc.mimeType ?? "unknown type"})` : "no file attached"}`,
  ];
  if (doc.signedAt) lines.push(`- Signed: ${fmt(doc.signedAt)}`);
  if (doc.expiresAt) lines.push(`- Expires: ${fmt(doc.expiresAt)}`);
  lines.push(`- Added: ${fmt(doc.createdAt)}`);
  if (hasFile) {
    lines.push(
      "",
      "Note: the attached file type can't be text-extracted yet, so only this metadata card was ingested — the agent knows the document exists but can't read inside it.",
    );
  }
  return lines.join("\n");
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
