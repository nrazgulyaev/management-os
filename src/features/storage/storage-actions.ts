"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  uploadDocument,
  getDocumentSignedUrl,
  deleteDocument,
  type DocumentEntityType,
  type DocumentVisibility,
} from "./storage-service";

/**
 * STORAGE-1 — Server-action wrappers around storage-service.
 *
 * Each action enforces auth via getCurrentAppUser() and adds
 * revalidatePath() side effects. Authorization beyond "signed-in"
 * is delegated to callers (page-level role checks); the service
 * itself does NOT check role to keep cron + system jobs unblocked.
 */

interface ActionResult {
  ok: boolean;
  error?: string;
  documentId?: string;
  signedUrl?: string;
  storagePath?: string;
}

export async function uploadDocumentAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "Sign in required" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  const entityType = formData.get("entityType") as DocumentEntityType | null;
  const entityId = formData.get("entityId") as string | null;
  const documentType = (formData.get("documentType") as string | null) ?? "other";
  const title = (formData.get("title") as string | null) ?? file.name;
  const visibility =
    (formData.get("visibility") as DocumentVisibility | null) ?? "operator_only";

  if (!entityType || !entityId) {
    return { ok: false, error: "entityType + entityId required" };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await uploadDocument({
    organizationId: user.organizationId,
    entityType,
    entityId,
    documentType,
    title,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes,
    visibility,
    uploadedBy: user.id,
  });
  if (result.ok) {
    revalidatePath("/dashboard");
    revalidatePath("/owner");
    revalidatePath("/investor-portal");
  }
  return result;
}

export async function getDocumentSignedUrlAction(
  documentId: string,
): Promise<ActionResult> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "Sign in required" };
  const result = await getDocumentSignedUrl(documentId);
  return result;
}

export async function deleteDocumentAction(documentId: string): Promise<ActionResult> {
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "Sign in required" };
  const result = await deleteDocument(documentId);
  if (result.ok) {
    revalidatePath("/dashboard");
    revalidatePath("/owner");
    revalidatePath("/investor-portal");
  }
  return result;
}
