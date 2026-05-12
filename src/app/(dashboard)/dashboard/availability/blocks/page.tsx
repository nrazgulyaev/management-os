import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listVillaCalendarBlocks } from "@/features/availability/services";
import { listVillas } from "@/features/villas/services";
import { CancelBlockButton } from "@/components/availability/cancel-block-button";
import { CalendarBlockAddButton } from "@/components/availability/block-add-button";

export const metadata = { title: "Calendar blocks" };
export const dynamic = "force-dynamic";

export default async function BlocksListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; blockType?: string }>;
}) {
  const sp = await searchParams;
  const [blocks, villas] = await Promise.all([
    listVillaCalendarBlocks({
      status: sp.status || undefined,
      blockType: sp.blockType || undefined,
      limit: 500,
    }),
    listVillas(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName ?? ""}` }));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Availability", href: "/dashboard/availability" },
          { label: "Calendar blocks" },
        ]}
        title="Calendar blocks"
        description="All blocks across the portfolio. Booking-sourced blocks are managed via their booking; cancel manual blocks here when no longer needed."
        actions={<CalendarBlockAddButton villas={villaOpts} />}
      />

      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-widest">
        {[
          { label: "All", href: "/dashboard/availability/blocks" },
          { label: "Active", href: "/dashboard/availability/blocks?status=active" },
          { label: "Cancelled", href: "/dashboard/availability/blocks?status=cancelled" },
        ].map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="px-3 py-1.5 rounded-full border border-line-soft text-ink-secondary hover:border-line-strong"
          >
            {p.label}
          </Link>
        ))}
      </div>

      <Section eyebrow="Blocks" title={`${blocks.length} rows`}>
        {blocks.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No blocks.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Title</th>
                  <th className="text-left px-3 py-2">From</th>
                  <th className="text-left px-3 py-2">To</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {blocks.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2 text-ink font-medium">{b.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{b.blockType.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-ink-secondary">{b.title}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {b.startsAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {b.endsAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={b.status === "active" ? "info" : "neutral"}>
                        {b.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {b.status === "active" && b.sourceType !== "booking" && (
                        <CancelBlockButton id={b.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
