import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestShell } from "@/components/layout/guest-shell";
import { ArrowLeft } from "lucide-react";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";
import { MarkdownBlock } from "@/components/stay/markdown-block";

export const metadata = { title: "Villa guide" };
export const dynamic = "force-dynamic";

const GUIDE_KEYS = ["amenities", "appliances", "transport", "general"] as const;

export default async function GuidePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getGuestStaySummaryByToken(token);
  if (!result.ok) notFound();
  const { summary } = result;
  const villaLabel = summary.base.villaName ?? summary.base.villaCode ?? "Your villa";
  const sections = summary.sections.filter((s) =>
    GUIDE_KEYS.includes(s.sectionKey as (typeof GUIDE_KEYS)[number]),
  );
  return (
    <GuestShell villaName={villaLabel} dates={`${summary.base.checkIn} → ${summary.base.checkOut}`}>
      <div className="flex flex-col gap-6">
        <Link
          href={`/stay/${token}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Stay home
        </Link>
        <h1 className="text-2xl font-medium text-ink">Villa guide</h1>
        {sections.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            Guide content is being prepared.
          </p>
        ) : (
          sections.map((s) => (
            <section
              key={s.id}
              className="rounded-xl border border-line-soft bg-surface p-6"
            >
              <h2 className="text-lg font-medium text-ink mb-3">{s.title}</h2>
              <MarkdownBlock source={s.bodyMd} />
            </section>
          ))
        )}
      </div>
    </GuestShell>
  );
}
