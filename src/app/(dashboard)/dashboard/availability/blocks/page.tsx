import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/availability">Availability</Link> /{" "}
            <span>Calendar blocks</span>
          </div>
          <h1>Calendar blocks</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            All blocks across the portfolio. Booking-sourced blocks are managed
            via their booking; cancel manual blocks here when no longer needed.
          </p>
        </div>
        <div className="actions">
          <CalendarBlockAddButton villas={villaOpts} />
        </div>
      </div>

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

      <div>
        <div className="label mb-2.5">Blocks · {blocks.length} rows</div>
        {blocks.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No blocks.
          </p>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Villa</th>
                  <th scope="col">Type</th>
                  <th scope="col">Title</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Status</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={b.id}>
                    <td className="row-title">{b.villaCode ?? "—"}</td>
                    <td>{b.blockType.replace(/_/g, " ")}</td>
                    <td>{b.title}</td>
                    <td className="num">
                      {b.startsAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="num">
                      {b.endsAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td>
                      <HandoffBadge tone={b.status === "active" ? "info" : "soft"}>
                        {b.status}
                      </HandoffBadge>
                    </td>
                    <td className="text-right">
                      {b.status === "active" && b.sourceType !== "booking" && (
                        <CancelBlockButton id={b.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
