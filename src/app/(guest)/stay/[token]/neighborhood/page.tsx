import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestShell } from "@/components/layout/guest-shell";
import { ArrowLeft, MapPin } from "lucide-react";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";

export const metadata = { title: "Neighborhood" };
export const dynamic = "force-dynamic";

export default async function NeighborhoodPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getGuestStaySummaryByToken(token);
  if (!result.ok) notFound();
  const { summary } = result;
  const villaLabel = summary.base.villaName ?? summary.base.villaCode ?? "Your villa";

  // Group by category for a clean list.
  const byCategory = new Map<string, typeof summary.neighborhood>();
  for (const p of summary.neighborhood) {
    const key = p.category;
    const list = byCategory.get(key) ?? [];
    list.push(p);
    byCategory.set(key, list);
  }

  return (
    <GuestShell villaName={villaLabel} dates={`${summary.base.checkIn} → ${summary.base.checkOut}`}>
      <div className="flex flex-col gap-6">
        <Link
          href={`/stay/${token}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Stay home
        </Link>
        <h1 className="text-2xl font-medium text-ink">Neighborhood</h1>
        {byCategory.size === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            Recommendations are being prepared.
          </p>
        ) : (
          Array.from(byCategory.entries()).map(([category, places]) => (
            <section
              key={category}
              className="rounded-xl border border-line-soft bg-surface p-6"
            >
              <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                {category}
              </div>
              <ul className="divide-y divide-line-soft mt-2">
                {places.map((p) => (
                  <li key={p.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-ink font-medium text-sm">{p.name}</div>
                        {(p.distanceLabel || p.travelTimeLabel) && (
                          <div className="text-[11px] text-ink-tertiary mt-0.5">
                            {[p.distanceLabel, p.travelTimeLabel].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      {p.googleMapsUrl && (
                        <a
                          href={p.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-ink hover:underline underline-offset-4"
                        >
                          <MapPin className="w-3.5 h-3.5" /> Map
                        </a>
                      )}
                    </div>
                    {p.address && (
                      <div className="text-[11px] text-ink-tertiary mt-1">{p.address}</div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </GuestShell>
  );
}
