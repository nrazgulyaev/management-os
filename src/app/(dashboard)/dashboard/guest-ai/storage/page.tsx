import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import {
  ValidateBucketButton,
  StripPendingButton,
  CleanupStaleButton,
} from "@/components/guest-ai/storage-action-buttons";
import { getGuestRequestAttachmentStorageHealth } from "@/features/guest-ai-concierge/storage-bucket";
import { listFailedMetadata } from "@/features/guest-ai-concierge/attachment-cleanup";

export const metadata = { title: "Guest concierge storage" };
export const dynamic = "force-dynamic";

const TONES: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  ok: "success",
  unknown: "neutral",
  warning: "warning",
  failed: "danger",
};

export default async function StorageHealthPage() {
  const { safeList } = await import("@/features/system/db-health");
  const [healthResult, failedMetadataResult] = await Promise.all([
    safeList("guest_ai_storage.health", async () => [
      await getGuestRequestAttachmentStorageHealth(),
    ]),
    safeList("guest_ai_storage.failed_metadata", () => listFailedMetadata(20)),
  ]);
  const health = healthResult.value[0];
  const failedMetadata = failedMetadataResult.value;
  if (!health) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[
            { label: "Guest stays", href: "/dashboard/guest-stays" },
            { label: "Concierge AI", href: "/dashboard/guest-ai" },
            { label: "Storage" },
          ]}
          title="Storage health"
          description="Database not reachable or migrations pending."
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Concierge AI", href: "/dashboard/guest-ai" },
          { label: "Storage" },
        ]}
        title="Storage health"
        description="Bucket / signed URL / metadata-strip / cleanup status for guest concierge attachments. Bucket name: guest-request-attachments. The bucket must be PRIVATE and accessed only via short-lived signed URLs."
        actions={
          <span className="text-[11px] text-ink-tertiary tabular-nums">
            Last checked{" "}
            {new Date(health.checkedAt)
              .toISOString()
              .slice(0, 16)
              .replace("T", " ")}
          </span>
        }
      />

      <Section eyebrow="1" title="Storage bucket health">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Bucket exists"
            value={health.bucketExists}
            accent={health.bucketExists !== "ok"}
          />
          <MetricCard
            label="Private"
            value={health.bucketPrivate}
            accent={health.bucketPrivate === "failed"}
          />
          <MetricCard
            label="Signed upload"
            value={health.signedUploadWorks}
            accent={health.signedUploadWorks === "failed"}
          />
          <MetricCard
            label="Signed download"
            value={health.signedDownloadWorks}
          />
        </div>
        {health.notes.length > 0 && (
          <ul className="mt-4 rounded-md border border-line-soft bg-canvas/40 p-4 text-[11px] text-ink-secondary list-disc list-inside space-y-1">
            {health.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <ValidateBucketButton />
        </div>
      </Section>

      <Section eyebrow="2" title="Attachment processing">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Pending uploads"
            value={String(health.pendingAttachments)}
          />
          <MetricCard
            label="Pending metadata strip"
            value={String(health.pendingMetadata)}
            accent={health.pendingMetadata > 0}
          />
          <MetricCard
            label="Failed metadata"
            value={String(health.failedMetadata)}
            accent={health.failedMetadata > 0}
          />
          <MetricCard
            label="Stale pending (>24h)"
            value={String(health.stalePending)}
            accent={health.stalePending > 0}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <StripPendingButton />
          <CleanupStaleButton />
        </div>
      </Section>

      <Section
        eyebrow="3"
        title={`Recent failed metadata strips (${failedMetadata.length})`}
        description="Each row tried to strip EXIF/text chunks and failed. The attachment is hidden from the guest until an operator triages it."
      >
        {failedMetadata.length === 0 ? (
          <p className="rounded-md border border-line-soft bg-surface p-6 text-sm text-ink-tertiary">
            No failed strips. 🎉
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">MIME</th>
                  <th className="px-4 py-3">Error</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {failedMetadata.map((f) => (
                  <tr
                    key={f.id}
                    className="border-t border-line-soft align-top"
                  >
                    <td className="px-4 py-3 text-[11px] text-ink-tertiary tabular-nums whitespace-nowrap">
                      {new Date(f.createdAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </td>
                    <td className="px-4 py-3 text-xs">{f.fileName}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      {f.mimeType}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-danger max-w-md break-words">
                      {f.metadataError ?? "(unknown)"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/guest-ai/handoffs/${f.handoffId}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Open handoff
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        eyebrow="4"
        title="Daily cleanup cron"
        description="The platform runs `guest_request_attachment_cleanup` every 24 hours via /api/cron/guest-request-attachments-cleanup. Use the manual button above to trigger it on demand."
      >
        <div className="rounded-md border border-line-soft bg-surface p-5 text-sm flex items-center gap-3">
          <Badge tone={TONES[health.bucketExists]}>cron · enabled</Badge>
          <span className="text-ink-secondary">
            Sweeps `pending` attachments older than 24h, deletes the
            storage object, marks rows `deleted` with reason
            `stale_pending`. Failed-metadata rows are NOT auto-deleted.
          </span>
        </div>
      </Section>
    </div>
  );
}
