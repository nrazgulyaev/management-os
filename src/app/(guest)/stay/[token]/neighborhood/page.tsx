import { notFound } from "next/navigation";
import { StayShell } from "@/components/layout/stay-shell";
import { StayHeader, Eyebrow } from "@/components/stay/stay-ui";
import { MapPin } from "lucide-react";
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
    <StayShell
      villaName={villaLabel}
      dates={`${summary.base.checkIn} → ${summary.base.checkOut}`}
      basePath={`/stay/${token}`}
    >
      <div className="flex flex-col gap-6">
        <StayHeader title="Nearby" backHref={`/stay/${token}`} />
        {byCategory.size === 0 ? (
          <p className="rounded-[var(--r-md)] border border-dashed border-line-soft bg-muted/40 px-5 py-6 text-sm text-ink-tertiary">
            Recommendations are being prepared.
          </p>
        ) : (
          Array.from(byCategory.entries()).map(([category, places]) => (
            <section key={category} className="flex flex-col gap-3">
              <Eyebrow>{category}</Eyebrow>
              {places.map((p) => (
                <div
                  key={p.id}
                  className="flex gap-3.5 items-center p-3.5 rounded-[var(--r-md)] border border-line-soft bg-surface shadow-[var(--shadow-card)]"
                >
                  <span className="w-16 h-16 rounded-[14px] shrink-0 bg-gradient-coral-soft flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-terra" strokeWidth={1.6} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold text-ink">
                      {p.name}
                    </div>
                    {(p.distanceLabel || p.travelTimeLabel) && (
                      <div className="text-[12.5px] text-ink-tertiary mt-0.5">
                        {[p.distanceLabel, p.travelTimeLabel]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                    {p.address && (
                      <div className="text-[11px] text-ink-tertiary mt-1">
                        {p.address}
                      </div>
                    )}
                  </div>
                  {p.googleMapsUrl && (
                    <a
                      href={p.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${p.name} on the map`}
                      className="w-[34px] h-[34px] shrink-0 rounded-full bg-muted border border-line text-forest flex items-center justify-center"
                    >
                      <MapPin className="w-4 h-4" strokeWidth={2} />
                    </a>
                  )}
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </StayShell>
  );
}
