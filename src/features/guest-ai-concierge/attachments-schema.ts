import { z } from "zod";
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_VISIBILITY,
  MAX_FILE_BYTES,
} from "./attachments-pure";

const fileMetaSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({
      message: `Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
    }),
  }),
  sizeBytes: z.coerce.number().int().min(1).max(MAX_FILE_BYTES, {
    message: `File exceeds ${Math.round(
      MAX_FILE_BYTES / (1024 * 1024),
    )} MB limit.`,
  }),
});

export const guestAttachmentUploadRequestSchema = fileMetaSchema.extend({
  token: z.string().min(16),
  replyId: z.string().uuid(),
});
export type GuestAttachmentUploadRequest = z.infer<
  typeof guestAttachmentUploadRequestSchema
>;

export const staffAttachmentUploadRequestSchema = fileMetaSchema.extend({
  handoffId: z.string().uuid(),
  replyId: z.string().uuid(),
  visibility: z.enum(ALLOWED_VISIBILITY).default("guest_visible"),
});
export type StaffAttachmentUploadRequest = z.infer<
  typeof staffAttachmentUploadRequestSchema
>;

export const registerUploadedSchema = z.object({
  attachmentId: z.string().uuid(),
});

export const guestRegisterUploadedSchema = registerUploadedSchema.extend({
  token: z.string().min(16),
});

export const guestDeleteAttachmentSchema = z.object({
  token: z.string().min(16),
  attachmentId: z.string().uuid(),
});

export const staffDeleteAttachmentSchema = z.object({
  attachmentId: z.string().uuid(),
});
