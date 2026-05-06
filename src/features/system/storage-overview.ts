/**
 * Prompt 114 — Aggregated storage-bucket overview for the system
 * dashboard.  Pure helper: derives bucket descriptors from constants
 * + the doc table.  Live health checks are still per-bucket
 * (`getGuestRequestAttachmentStorageHealth` etc).
 */

export interface BucketDescriptor {
  name: string;
  privacy: "private" | "public" | "unknown";
  usedBy: string;
  maxSizeMb: number | null;
  hasCleanupCron: boolean;
  hasMetadataStrip: boolean;
  /** Where in code the bucket constant is declared. */
  declaredAt: string;
}

export const BUCKET_DESCRIPTORS: BucketDescriptor[] = [
  {
    name: "task-attachments",
    privacy: "private",
    usedBy: "Field app — operation tasks, damage reports, material usage.",
    maxSizeMb: 12,
    hasCleanupCron: false,
    hasMetadataStrip: true,
    declaredAt: "src/features/attachments/schema.ts",
  },
  {
    name: "guest-request-attachments",
    privacy: "private",
    usedBy: "Guest concierge — service requests + AI handoffs.",
    maxSizeMb: 8,
    hasCleanupCron: true,
    hasMetadataStrip: true,
    declaredAt: "src/features/guest-ai-concierge/attachments-pure.ts",
  },
];

export function listBuckets(): BucketDescriptor[] {
  return [...BUCKET_DESCRIPTORS];
}
