import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HandoffBadge, Card } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Marketing</span> /{" "}
            <Link href="/development-os/marketing/content">Content</Link> /{" "}
            <span>{piece.contentCode}</span>
          </div>
          <h1>{piece.title}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {piece.contentType}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/marketing/content"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <HandoffBadge tone="info">{piece.status}</HandoffBadge>
        </Card>
      </div>
      <div className="mt-[18px]">
        <div className="label mb-2.5">Brief</div>
        <Card padding="default">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{piece.contentBrief}</p>
        </Card>
      </div>
      {piece.caption && (
        <div className="mt-[18px]">
          <div className="label mb-2.5">Caption</div>
          <Card padding="default">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{piece.caption}</p>
          </Card>
        </div>
      )}
      {piece.hashtags && piece.hashtags.length > 0 && (
        <div className="mt-[18px]">
          <div className="label mb-2.5">Hashtags</div>
          <Card padding="default">
            <p className="text-sm font-mono">
              {piece.hashtags.map((h) => `#${h}`).join(" ")}
            </p>
          </Card>
        </div>
      )}
      <div className="mt-[18px]">
        <div className="label mb-2.5">{`${variants.length} variant(s)`}</div>
        <Card padding="default">
          {variants.length === 0 ? (
            <p className="text-sm text-ink-tertiary">No variants yet.</p>
          ) : (
            <ul className="text-sm space-y-2">
              {variants.map((v) => (
                <li key={v.id} className="border-b border-line-soft pb-1">
                  <span className="font-medium">{v.variantLabel}</span>{" "}
                  <HandoffBadge tone="soft">{v.variantType}</HandoffBadge>{" "}
                  <HandoffBadge tone="info">{v.variantStatus}</HandoffBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DevelopmentShell>
  );
}
