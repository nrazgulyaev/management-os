import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getHoldById } from "@/features/direct-booking/services";
import { adminHoldStatusLabel } from "@/features/direct-booking/hold-pure";
import { CancelHoldButton } from "@/components/direct-booking/admin-buttons";

export const metadata = { title: "Hold detail" };
export const dynamic = "force-dynamic";

export default async function HoldDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hold = await getHoldById(id);
  if (!hold) notFound();
  const lab = adminHoldStatusLabel(
    hold.status as Parameters<typeof adminHoldStatusLabel>[0],
  );
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          { label: "Holds", href: "/dashboard/direct-bookings/holds" },
          { label: hold.holdCode },
        ]}
        title={hold.holdCode}
        description={`${hold.checkIn} → ${hold.checkOut} · ${hold.nights} nights`}
        actions={
          <div className="flex items-center gap-3">
            <Badge tone={lab.tone}>{lab.label}</Badge>
            {hold.status === "active" && <CancelHoldButton id={hold.id} />}
          </div>
        }
      />
      <Section eyebrow="Snapshot" title="Quote captured at hold time">
        <pre className="rounded-md border border-line-soft bg-canvas p-4 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(hold.quoteSnapshotJson, null, 2)}
        </pre>
      </Section>
      <Section eyebrow="Calendar" title="Block status">
        <p className="text-xs text-ink-tertiary">
          Internal hold block on `villa_calendar_blocks` is{" "}
          {hold.status === "active" || hold.status === "converted"
            ? "active"
            : "released"}
          .
        </p>
      </Section>
    </div>
  );
}
