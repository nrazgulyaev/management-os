import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listOwnerVillasForCurrentUser } from "@/features/owner-intelligence/calendar-services";
import { getVillaOperationalTimeline } from "@/features/owner-intelligence/health-services";

export const metadata = { title: "Villa timeline" };
export const dynamic = "force-dynamic";

export default async function OwnerVillaTimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const villas = await listOwnerVillasForCurrentUser();
  const villa = villas.find((v) => v.villaId === id);
  if (!villa) notFound();
  const today = new Date();
  const from = formatISODate(
    new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000),
  );
  const to = formatISODate(
    new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000),
  );
  const events = await getVillaOperationalTimeline(id, from, to);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "My villas", href: "/owner/villas" },
          {
            label: villa.villaName ?? villa.villaCode ?? id,
            href: `/owner/villas/${id}/calendar`,
          },
          { label: "Timeline" },
        ]}
        title={`${villa.villaName ?? villa.villaCode ?? "Villa"} timeline`}
        description={`Operational events between ${from} and ${to}.`}
      />
      <Link
        href={`/owner/villas/${id}/calendar`}
        className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Calendar
      </Link>
      <Section eyebrow="Activity" title={`${events.length} events`}>
        {events.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No operational activity in this window.
          </p>
        ) : (
          <ol className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {events.map((event) => (
              <li
                key={event.id}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-[11px] text-ink-tertiary">
                    {event.eventDate}
                  </span>
                  <span className="text-sm text-ink">{event.title}</span>
                </div>
                <Badge
                  tone={
                    event.severity === "critical"
                      ? "danger"
                      : event.severity === "warning"
                        ? "warning"
                        : event.severity === "success"
                          ? "success"
                          : "neutral"
                  }
                >
                  {event.sourceType.replace("_", " ")}
                </Badge>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

function formatISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
