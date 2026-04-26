import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { taskAttachments } from "@/lib/db/schema/operations";
import { appUsers } from "@/lib/db/schema/identity";
import type { WithSource } from "@/features/types";
import { createSignedDownloadUrl } from "./storage";

export interface AttachmentRow {
  id: string;
  taskId: string | null;
  checklistItemId: string | null;
  maintenanceTicketId: string | null;
  attachmentType: string;
  caption: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  storageBucket: string | null;
  storagePath: string | null;
  uploadStatus: string;
  uploadedByName: string | null;
  createdAt: string;
  /** Lazily-minted signed URL (10 min). null when storage not configured. */
  signedUrl: string | null;
}

async function rowsWithUploaderAndUrls(
  rows: { a: typeof taskAttachments.$inferSelect; uploaderName: string | null }[],
): Promise<WithSource<AttachmentRow>[]> {
  const out: WithSource<AttachmentRow>[] = [];
  for (const r of rows) {
    let signedUrl: string | null = null;
    if (r.a.uploadStatus === "uploaded" && r.a.storagePath) {
      const signed = await createSignedDownloadUrl(r.a.storagePath);
      signedUrl = signed?.url ?? null;
    }
    out.push({
      source: "db" as const,
      id: r.a.id,
      taskId: r.a.taskId,
      checklistItemId: r.a.checklistItemId,
      maintenanceTicketId: r.a.maintenanceTicketId,
      attachmentType: r.a.attachmentType,
      caption: r.a.caption,
      fileName: r.a.fileName,
      mimeType: r.a.mimeType,
      sizeBytes: r.a.sizeBytes,
      storageBucket: r.a.storageBucket,
      storagePath: r.a.storagePath,
      uploadStatus: r.a.uploadStatus,
      uploadedByName: r.uploaderName,
      createdAt: r.a.createdAt.toISOString(),
      signedUrl,
    });
  }
  return out;
}

export async function listTaskAttachments(taskId: string) {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ a: taskAttachments, uploaderName: appUsers.fullName })
    .from(taskAttachments)
    .leftJoin(appUsers, eq(appUsers.id, taskAttachments.uploadedBy))
    .where(eq(taskAttachments.taskId, taskId))
    .orderBy(desc(taskAttachments.createdAt));
  return rowsWithUploaderAndUrls(rows);
}

export async function listChecklistItemAttachments(checklistItemId: string) {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ a: taskAttachments, uploaderName: appUsers.fullName })
    .from(taskAttachments)
    .leftJoin(appUsers, eq(appUsers.id, taskAttachments.uploadedBy))
    .where(eq(taskAttachments.checklistItemId, checklistItemId))
    .orderBy(asc(taskAttachments.createdAt));
  return rowsWithUploaderAndUrls(rows);
}

export async function listMaintenanceTicketAttachments(ticketId: string) {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ a: taskAttachments, uploaderName: appUsers.fullName })
    .from(taskAttachments)
    .leftJoin(appUsers, eq(appUsers.id, taskAttachments.uploadedBy))
    .where(eq(taskAttachments.maintenanceTicketId, ticketId))
    .orderBy(desc(taskAttachments.createdAt));
  return rowsWithUploaderAndUrls(rows);
}

/**
 * Build a Map<checklistItemId, count of *uploaded* attachments>. Used by
 * `evaluateChecklistReadiness` to enforce photo_required.
 */
export async function countUploadedAttachmentsForChecklistItems(
  itemIds: string[],
): Promise<Map<string, number>> {
  const db = getDb();
  if (!db || itemIds.length === 0) return new Map();
  const rows = await db
    .select({ id: taskAttachments.checklistItemId, status: taskAttachments.uploadStatus })
    .from(taskAttachments)
    .where(
      and(
        inArray(taskAttachments.checklistItemId, itemIds),
        eq(taskAttachments.uploadStatus, "uploaded"),
      ),
    );
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.id) continue;
    out.set(r.id, (out.get(r.id) ?? 0) + 1);
  }
  return out;
}
