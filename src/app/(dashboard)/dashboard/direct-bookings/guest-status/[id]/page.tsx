import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAdminSnapshotById,
} from "@/features/direct-booking/guest-messages";
import {
  RebuildSnapshotButton,
  AdminQueueNotificationForm,
} from "@/components/direct-booking/guest-status-buttons";

export const metadata = { title: "Guest status detail" };
export const dynamic = "force-dynamic";

export default async function GuestStatusDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getAdminSnapshotById(id);
  if (!s) notFound();
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <Link href="/dashboard/direct-bookings/guest-status">
              Guest status
            </Link>{" "}
            / <span>{s.villaLabel ?? "Snapshot"}</span>
          </div>
          <h1>{s.headline}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Stage {s.publicStage} · {s.checkIn} → {s.checkOut}
          </p>
        </div>
        <div className="actions">
          <RebuildSnapshotButton holdId={s.holdId} />
        </div>
      </div>

      <div className="flex flex-col gap-10">
        <div>
          <div className="label mb-2.5">Internal trace</div>
          <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <Trace label="Hold" id={s.holdId} href={`/dashboard/direct-bookings/holds/${s.holdId}`} />
            <Trace
              label="Request"
              id={s.requestId}
              href={s.requestId ? `/dashboard/direct-bookings/requests/${s.requestId}` : null}
            />
            <Trace
              label="Deposit"
              id={s.depositId}
              href={s.depositId ? `/dashboard/direct-bookings/deposits/${s.depositId}` : null}
            />
            <Trace
              label="Booking"
              id={s.bookingId}
              href={s.bookingId ? `/dashboard/bookings/${s.bookingId}` : null}
            />
          </div>
        </div>

        <div>
          <div className="label mb-2.5">Manual notification</div>
          <p className="text-[13px] text-ink-3 mt-0 mb-3 max-w-[680px]">
            Use this only for owner-safe, public-tone copy. Internal IDs and
            provider details must not appear in the title or body.
          </p>
          <AdminQueueNotificationForm holdId={s.holdId} />
        </div>

        <p className="text-xs text-ink-tertiary">
          Source updated at{" "}
          {s.sourceUpdatedAt
            ? s.sourceUpdatedAt.slice(0, 16).replace("T", " ")
            : "—"}
          . Snapshot last updated {s.updatedAt.slice(0, 16).replace("T", " ")}.
        </p>
      </div>
    </>
  );
}

function Trace({
  label,
  id,
  href,
}: {
  label: string;
  id: string | null;
  href: string | null;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      {id ? (
        href ? (
          <Link
            href={href}
            className="block text-sm font-mono text-ink hover:underline underline-offset-4 mt-1 truncate"
          >
            {id.slice(0, 8)}…
          </Link>
        ) : (
          <span className="block text-sm font-mono text-ink mt-1 truncate">
            {id.slice(0, 8)}…
          </span>
        )
      ) : (
        <span className="block text-sm text-ink-tertiary mt-1">—</span>
      )}
    </div>
  );
}
