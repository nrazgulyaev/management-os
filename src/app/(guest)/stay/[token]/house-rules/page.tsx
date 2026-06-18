import { notFound } from "next/navigation";
import { StayShell } from "@/components/layout/stay-shell";
import { StayHeader } from "@/components/stay/stay-ui";
import { MarkdownBlock } from "@/components/stay/markdown-block";
import { RateLimitedView } from "@/components/stay/rate-limited";
import { resolveGatedStay } from "@/features/guest-stays/gated-resolver";

export const metadata = { title: "House rules" };
export const dynamic = "force-dynamic";

export default async function HouseRulesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const gated = await resolveGatedStay(token, {
    eventType: "guide_opened",
    section: "house_rules",
  });
  if (gated.kind === "rate_limited") {
    return <RateLimitedView blockedUntil={gated.blockedUntil} />;
  }
  if (gated.kind === "unavailable") notFound();
  const { summary } = gated;
  const villaLabel = summary.base.villaName ?? summary.base.villaCode ?? "Your villa";
  const section = summary.sections.find((s) => s.sectionKey === "house_rules");
  return (
    <StayShell
      villaName={villaLabel}
      dates={`${summary.base.checkIn} → ${summary.base.checkOut}`}
      basePath={`/stay/${token}`}
    >
      <div className="flex flex-col gap-6">
        <StayHeader title="House rules" backHref={`/stay/${token}`} />
        {section ? (
          <section className="rounded-[var(--r-card)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-5">
            <h2 className="text-display text-[19px] font-normal text-ink mb-3">
              {section.title}
            </h2>
            <MarkdownBlock source={section.bodyMd} />
          </section>
        ) : (
          <p className="rounded-[var(--r-md)] border border-dashed border-line-soft bg-muted/40 px-5 py-6 text-sm text-ink-tertiary">
            Your host hasn&apos;t published house rules for this villa yet.
          </p>
        )}
      </div>
    </StayShell>
  );
}
