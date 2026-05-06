import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  getContentByCode,
  listContentVariants,
} from "@/lib/development/server/content/content-queries";

export const metadata: Metadata = { title: "Content piece · Marketing" };
export const dynamic = "force-dynamic";

export default async function ContentPieceDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const piece = await getContentByCode(code);
  if (!piece) notFound();
  const variants = await listContentVariants(piece.id);
  return (
    <DevelopmentShell>
      <PageHeader
        title={piece.title}
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Content", href: "/development-os/marketing/content" },
          { label: piece.contentCode },
        ]}
        description={piece.contentType}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/marketing/content">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Status">
        <Badge tone="info">{piece.status}</Badge>
      </Section>
      <Section title="Brief">
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{piece.contentBrief}</p>
      </Section>
      {piece.caption && (
        <Section title="Caption">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{piece.caption}</p>
        </Section>
      )}
      {piece.hashtags && piece.hashtags.length > 0 && (
        <Section title="Hashtags">
          <p className="text-sm font-mono">
            {piece.hashtags.map((h) => `#${h}`).join(" ")}
          </p>
        </Section>
      )}
      <Section title={`${variants.length} variant(s)`}>
        {variants.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No variants yet.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {variants.map((v) => (
              <li key={v.id} className="border-b border-line-soft pb-1">
                <span className="font-medium">{v.variantLabel}</span>{" "}
                <Badge tone="neutral">{v.variantType}</Badge>{" "}
                <Badge tone="info">{v.variantStatus}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </DevelopmentShell>
  );
}
