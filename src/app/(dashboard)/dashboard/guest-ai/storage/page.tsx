import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <Link href="/dashboard/guest-ai">Concierge AI</Link> /{" "}
            <span>Storage</span>
          </div>
          <h1>Storage health</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Database not reachable or migrations pending.
          </p>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <Link href="/dashboard/guest-ai">Concierge AI</Link> /{" "}
            <span>Storage</span>
          </div>
          <h1>Storage health</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Bucket / signed URL / metadata-strip / cleanup status for guest
            concierge attachments. Bucket name: guest-request-attachments.
            The bucket must be PRIVATE and accessed only via short-lived
            signed URLs.
          </p>
        </div>
        <div className="actions">
          <span className="mono text-[11px] text-ink-4 tabular-nums">
            Last checked{" "}
            {new Date(health.checkedAt)
              .toISOString()
              .slice(0, 16)
              .replace("T", " ")}
          </span>
        </div>
      </div>

      <h2 className="display text-[22px] font-normal mb-3.5">
        Storage bucket health
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Bucket exists"
          value={health.bucketExists}
          tone={health.bucketExists !== "ok" ? "danger" : "success"}
        />
        <Kpi
          label="Private"
          value={health.bucketPrivate}
          tone={health.bucketPrivate === "failed" ? "danger" : undefined}
        />
        <Kpi
          label="Signed upload"
          value={health.signedUploadWorks}
          tone={health.signedUploadWorks === "failed" ? "danger" : undefined}
        />
        <Kpi
          label="Signed download"
          value={health.signedDownloadWorks}
        />
      </div>
      {health.notes.length > 0 && (
        <ul className="card mt-4 px-5 py-[14px] text-[11px] text-ink-3 list-disc list-inside space-y-1">
          {health.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <ValidateBucketButton />
      </div>

      <h2 className="display text-[22px] font-normal mt-8 mb-3.5">
        Attachment processing
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Pending uploads"
          value={String(health.pendingAttachments)}
        />
        <Kpi
          label="Pending metadata strip"
          value={String(health.pendingMetadata)}
          tone={health.pendingMetadata > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Failed metadata"
          value={String(health.failedMetadata)}
          tone={health.failedMetadata > 0 ? "danger" : undefined}
        />
        <Kpi
          label="Stale pending (>24h)"
          value={String(health.stalePending)}
          tone={health.stalePending > 0 ? "warn" : undefined}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <StripPendingButton />
        <CleanupStaleButton />
      </div>

      <div className="mt-8 mb-3.5">
        <h2 className="display text-[22px] font-normal">
          Recent failed metadata strips ({failedMetadata.length})
        </h2>
        <p className="text-[13px] text-ink-3 mt-1 max-w-[760px]">
          Each row tried to strip EXIF/text chunks and failed. The attachment
          is hidden from the guest until an operator triages it.
        </p>
      </div>
      {failedMetadata.length === 0 ? (
        <p className="card px-5 py-[18px] text-sm text-ink-4">
          No failed strips. 🎉
        </p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">File</th>
                <th scope="col">MIME</th>
                <th scope="col">Error</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {failedMetadata.map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="mono text-[11px] text-ink-4 tabular-nums whitespace-nowrap">
                    {new Date(f.createdAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                  <td className="text-[12px]">{f.fileName}</td>
                  <td className="mono text-[11px] text-ink-3">
                    {f.mimeType}
                  </td>
                  <td className="text-[11px] text-[var(--danger)] max-w-md break-words">
                    {f.metadataError ?? "(unknown)"}
                  </td>
                  <td className="num">
                    <Link
                      href={`/dashboard/guest-ai/handoffs/${f.handoffId}`}
                      className="btn btn-ghost btn-sm"
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

      <div className="mt-8 mb-3.5">
        <h2 className="display text-[22px] font-normal">
          Daily cleanup cron
        </h2>
        <p className="text-[13px] text-ink-3 mt-1 max-w-[760px]">
          The platform runs `guest_request_attachment_cleanup` every 24 hours
          via /api/cron/guest-request-attachments-cleanup. Use the manual
          button above to trigger it on demand.
        </p>
      </div>
      <div className="card px-5 py-[18px] text-sm flex items-center gap-3">
        <Badge tone={TONES[health.bucketExists]}>cron · enabled</Badge>
        <span className="text-ink-3">
          Sweeps `pending` attachments older than 24h, deletes the
          storage object, marks rows `deleted` with reason
          `stale_pending`. Failed-metadata rows are NOT auto-deleted.
        </span>
      </div>
    </>
  );
}
