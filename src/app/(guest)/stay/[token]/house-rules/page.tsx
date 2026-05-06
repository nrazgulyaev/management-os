import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestShell } from "@/components/layout/guest-shell";
import { ArrowLeft } from "lucide-react";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";
import { MarkdownBlock } from "@/components/stay/markdown-block";

export const metadata = { title: "House rules" };
export const dynamic = "force-dynamic";

export default async function HouseRulesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getGuestStaySummaryByToken(token);
  if (!result.ok) notFound();
  const { summary } = result;
  const villaLabel = summary.base.villaName ?? summary.base.villaCode ?? "Your villa";
  const section = summary.sections.find((s) => s.sectionKey === "house_rules");
  return (
    <GuestShell villaName={villaLabel} dates={`${summary.base.checkIn} → ${summary.base.checkOut}`}>
      <div className="flex flex-col gap-6">
        <Link
          href={`/stay/${token}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Stay home
        </Link>
        <h1 className="text-2xl font-medium text-ink">House rules</h1>
        {section ? (
          <section className="rounded-xl border border-line-soft bg-surface p-6">
            <h2 className="text-lg font-medium text-ink mb-3">{section.title}</h2>
            <MarkdownBlock source={section.bodyMd} />
          </section>
        ) : (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            Your host hasn't published house rules for this villa yet.
          </p>
        )}
      </div>
    </GuestShell>
  );
}
