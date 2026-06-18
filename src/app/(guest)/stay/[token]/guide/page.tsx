import { notFound } from "next/navigation";
import { StayShell } from "@/components/layout/stay-shell";
import { StayHeader } from "@/components/stay/stay-ui";
import { MarkdownBlock } from "@/components/stay/markdown-block";
import { RateLimitedView } from "@/components/stay/rate-limited";
import { resolveGatedStay } from "@/features/guest-stays/gated-resolver";

export const metadata = { title: "Villa guide" };
export const dynamic = "force-dynamic";

const GUIDE_KEYS = ["amenities", "appliances", "transport", "general"] as const;

export default async function GuidePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const gated = await resolveGatedStay(token, {
    eventType: "guide_opened",
    section: "guide",
  });
  if (gated.kind === "rate_limited") {
    return <RateLimitedView blockedUntil={gated.blockedUntil} />;
  }
  if (gated.kind === "unavailable") notFound();
  const { summary } = gated;
  const villaLabel = summary.base.villaName ?? summary.base.villaCode ?? "Your villa";
  const sections = summary.sections.filter((s) =>
    GUIDE_KEYS.includes(s.sectionKey as (typeof GUIDE_KEYS)[number]),
  );
  return (
    <StayShell
      villaName={villaLabel}
      dates={`${summary.base.checkIn} → ${summary.base.checkOut}`}
      basePath={`/stay/${token}`}
    >
      <div className="flex flex-col gap-6">
        <StayHeader title="Villa guide" backHref={`/stay/${token}`} />
        {sections.length === 0 ? (
          <p className="rounded-[var(--r-md)] border border-dashed border-line-soft bg-muted/40 px-5 py-6 text-sm text-ink-tertiary">
            Guide content is being prepared.
          </p>
        ) : (
          sections.map((s) => (
            <section
              key={s.id}
              className="rounded-[var(--r-card)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-5"
            >
              <h2 className="text-display text-[19px] font-normal text-ink mb-3">
                {s.title}
              </h2>
              <MarkdownBlock source={s.bodyMd} />
            </section>
          ))
        )}
      </div>
    </StayShell>
  );
}
