import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { listAdminSnapshots } from "@/features/direct-booking/guest-messages";
import {
  type PublicGuestStage,
} from "@/features/direct-booking/guest-status-pure";

export const metadata = { title: "Guest status snapshots" };
export const dynamic = "force-dynamic";

const STAGE_TONES: Record<
  PublicGuestStage,
  "neutral" | "info" | "warning" | "success" | "danger" | "accent"
> = {
  quote_held: "neutral",
  request_submitted: "info",
  under_review: "info",
  deposit_required: "warning",
  deposit_pending_confirmation: "info",
  deposit_confirmed: "success",
  approved: "info",
  confirmed: "success",
  in_house: "success",
  completed: "success",
  expired: "warning",
  cancelled: "neutral",
  rejected: "warning",
  failed: "danger",
};

export default async function GuestStatusOverviewPage() {
  const snapshots = await listAdminSnapshots();
  const counts = countStages(snapshots);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          { label: "Guest status" },
        ]}
        title="Guest status snapshots"
        description="Owner-safe snapshots of every direct-booking chain. Each row backs the public /book/hold/[token]/status page."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total" value={String(snapshots.length)} />
        <MetricCard
          label="Confirmed"
          value={String(counts.confirmed ?? 0)}
        />
        <MetricCard
          label="Awaiting"
          value={String(
            (counts.deposit_required ?? 0) +
              (counts.deposit_pending_confirmation ?? 0) +
              (counts.under_review ?? 0),
          )}
          accent={
            ((counts.deposit_required ?? 0) +
              (counts.under_review ?? 0)) >
            0
          }
        />
        <MetricCard
          label="Expired / failed"
          value={String(
            (counts.expired ?? 0) +
              (counts.failed ?? 0) +
              (counts.cancelled ?? 0),
          )}
          accent={(counts.failed ?? 0) > 0}
        />
      </div>
      <Section
        eyebrow="Snapshots"
        title={`${snapshots.length} total`}
        description="Sorted by most recent rebuild."
      >
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Villa</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Headline</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-xs">{s.villaLabel ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STAGE_TONES[s.publicStage]}>
                      {s.publicStage.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">{s.headline}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {s.checkIn} → {s.checkOut}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                    {s.updatedAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/direct-bookings/guest-status/${s.id}`}
                      className="text-xs text-ink hover:underline underline-offset-4"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function countStages(
  snapshots: ReadonlyArray<{ publicStage: PublicGuestStage }>,
): Partial<Record<PublicGuestStage, number>> {
  const out: Partial<Record<PublicGuestStage, number>> = {};
  for (const s of snapshots) {
    out[s.publicStage] = (out[s.publicStage] ?? 0) + 1;
  }
  return out;
}
