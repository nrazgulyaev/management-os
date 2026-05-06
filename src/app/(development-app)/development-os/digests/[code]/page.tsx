import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDigestByCode } from "@/lib/development/server/executive-digest/digest-queries";

export const metadata: Metadata = { title: "Digest · Development OS" };
export const dynamic = "force-dynamic";

function Markdown({ src }: { src: string | null }) {
  if (!src) return <p className="text-ink-tertiary text-sm">(empty)</p>;
  return (
    <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
      {src}
    </pre>
  );
}

export default async function DigestDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const d = await getDigestByCode(code);
  if (!d) notFound();

  return (
    <DevelopmentShell>
      <PageHeader
        title={d.periodLabel}
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Digests", href: "/development-os/digests" },
          { label: d.digestCode },
        ]}
        description={`${d.digestType} · ${d.periodStart} → ${d.periodEnd}`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/digests">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to digests
            </Link>
          </Button>
        }
      />

      <Section title="Status">
        <div className="flex gap-2">
          <Badge tone="info">status: {d.status}</Badge>
          {d.aiGenerated && <Badge tone="neutral">AI: {d.aiModel}</Badge>}
        </div>
      </Section>

      <Section title="Executive summary">
        <Markdown src={d.executiveSummary} />
      </Section>

      <Section title="Cash position">
        <Markdown src={d.cashPositionSection} />
      </Section>

      <Section title="Project progress">
        <Markdown src={d.projectProgressSection} />
      </Section>

      <Section title="Sales">
        <Markdown src={d.salesSection} />
      </Section>

      <Section title="Investor">
        <Markdown src={d.investorSection} />
      </Section>

      <Section title="Operations">
        <Markdown src={d.operationsSection} />
      </Section>

      <Section title="Risks">
        <Markdown src={d.risksSection} />
      </Section>

      {d.keyWins.length > 0 && (
        <Section title="Key wins">
          <ul className="list-disc pl-5 text-sm">
            {d.keyWins.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </Section>
      )}

      {d.keyConcerns.length > 0 && (
        <Section title="Key concerns">
          <ul className="list-disc pl-5 text-sm">
            {d.keyConcerns.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </Section>
      )}

      {d.recommendedActions.length > 0 && (
        <Section title="Recommended actions">
          <ul className="list-disc pl-5 text-sm">
            {d.recommendedActions.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </Section>
      )}
    </DevelopmentShell>
  );
}
