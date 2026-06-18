import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { getHoldById } from "@/features/direct-booking/services";
import { adminHoldStatusLabel } from "@/features/direct-booking/hold-pure";
import { CancelHoldButton } from "@/components/direct-booking/admin-buttons";
import { requireOrgId } from "@/features/auth/require-org";

export const metadata = { title: "Hold detail" };
export const dynamic = "force-dynamic";

const LAB_TONE: Record<
  "info" | "success" | "warning" | "neutral" | "danger",
  "info" | "ok" | "warn" | "soft" | "danger"
> = {
  info: "info",
  success: "ok",
  warning: "warn",
  neutral: "soft",
  danger: "danger",
};

export default async function HoldDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizationId = await requireOrgId();
  const hold = await getHoldById(id, organizationId);
  if (!hold) notFound();
  const lab = adminHoldStatusLabel(
    hold.status as Parameters<typeof adminHoldStatusLabel>[0],
  );
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <Link href="/dashboard/direct-bookings/holds">Holds</Link> /{" "}
            <span>{hold.holdCode}</span>
          </div>
          <h1>{hold.holdCode}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {hold.checkIn} → {hold.checkOut} · {hold.nights} nights
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-3">
            <HandoffBadge tone={LAB_TONE[lab.tone]}>{lab.label}</HandoffBadge>
            {hold.status === "active" && <CancelHoldButton id={hold.id} />}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-10">
        <div>
          <div className="label mb-2.5">Snapshot</div>
          <pre className="rounded-md border border-line-soft bg-canvas p-4 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(hold.quoteSnapshotJson, null, 2)}
          </pre>
        </div>

        <div>
          <div className="label mb-2.5">Calendar</div>
          <Card padding="default">
            <p className="text-xs text-ink-tertiary m-0">
              Internal hold block on `villa_calendar_blocks` is{" "}
              {hold.status === "active" || hold.status === "converted"
                ? "active"
                : "released"}
              .
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
