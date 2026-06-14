import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listAdminSnapshots } from "@/features/direct-booking/guest-messages";
import {
  type PublicGuestStage,
} from "@/features/direct-booking/guest-status-pure";

export const metadata = { title: "Guest status snapshots" };
export const dynamic = "force-dynamic";

const STAGE_TONES: Record<
  PublicGuestStage,
  "soft" | "info" | "warn" | "ok" | "danger"
> = {
  quote_held: "soft",
  request_submitted: "info",
  under_review: "info",
  deposit_required: "warn",
  deposit_pending_confirmation: "info",
  deposit_confirmed: "ok",
  approved: "info",
  confirmed: "ok",
  in_house: "ok",
  completed: "ok",
  expired: "warn",
  cancelled: "soft",
  rejected: "warn",
  failed: "danger",
};

export default async function GuestStatusOverviewPage() {
  const snapshots = await listAdminSnapshots();
  const counts = countStages(snapshots);
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <span>Guest status</span>
          </div>
          <h1>Guest status snapshots</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Owner-safe snapshots of every direct-booking chain. Each row backs
            the public /book/hold/[token]/status page.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total" value={String(snapshots.length)} />
        <Kpi label="Confirmed" value={String(counts.confirmed ?? 0)} />
        <Kpi
          label="Awaiting"
          value={String(
            (counts.deposit_required ?? 0) +
              (counts.deposit_pending_confirmation ?? 0) +
              (counts.under_review ?? 0),
          )}
          tone={
            ((counts.deposit_required ?? 0) + (counts.under_review ?? 0)) > 0
              ? "accent"
              : undefined
          }
        />
        <Kpi
          label="Expired / failed"
          value={String(
            (counts.expired ?? 0) +
              (counts.failed ?? 0) +
              (counts.cancelled ?? 0),
          )}
          tone={(counts.failed ?? 0) > 0 ? "accent" : undefined}
        />
      </div>

      <div>
        <div className="label mb-2.5">Snapshots · {snapshots.length} total</div>
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Villa</th>
                <th scope="col">Stage</th>
                <th scope="col">Headline</th>
                <th scope="col">Dates</th>
                <th scope="col">Updated</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id}>
                  <td className="text-xs">{s.villaLabel ?? "—"}</td>
                  <td>
                    <HandoffBadge tone={STAGE_TONES[s.publicStage]}>
                      {s.publicStage.replace(/_/g, " ")}
                    </HandoffBadge>
                  </td>
                  <td className="text-xs">{s.headline}</td>
                  <td className="mono tabular-nums text-xs">
                    {s.checkIn} → {s.checkOut}
                  </td>
                  <td className="text-[11px] text-ink-tertiary">
                    {s.updatedAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="text-right">
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
        </Card>
      </div>
    </>
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
