import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          {
            label: "Guest status",
            href: "/dashboard/direct-bookings/guest-status",
          },
          { label: s.villaLabel ?? "Snapshot" },
        ]}
        title={s.headline}
        description={`Stage ${s.publicStage} · ${s.checkIn} → ${s.checkOut}`}
        actions={<RebuildSnapshotButton holdId={s.holdId} />}
      />
      <Section eyebrow="Internal trace" title="Linked records">
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
      </Section>
      <Section
        eyebrow="Manual notification"
        title="Queue a guest-safe notification"
        description="Use this only for owner-safe, public-tone copy. Internal IDs and provider details must not appear in the title or body."
      >
        <AdminQueueNotificationForm holdId={s.holdId} />
      </Section>
      <p className="text-xs text-ink-tertiary">
        Source updated at{" "}
        {s.sourceUpdatedAt
          ? s.sourceUpdatedAt.slice(0, 16).replace("T", " ")
          : "—"}
        . Snapshot last updated {s.updatedAt.slice(0, 16).replace("T", " ")}.
      </p>
    </div>
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
