import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/digests">Digests</Link> /{" "}
            <span>{d.digestCode}</span>
          </div>
          <h1>{d.periodLabel}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${d.digestType} · ${d.periodStart} → ${d.periodEnd}`}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/digests"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back to digests
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <div className="flex gap-2">
            <HandoffBadge tone="info">status: {d.status}</HandoffBadge>
            {d.aiGenerated && <HandoffBadge tone="soft">AI: {d.aiModel}</HandoffBadge>}
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Executive summary</div>
        <Card padding="default">
          <Markdown src={d.executiveSummary} />
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Cash position</div>
        <Card padding="default">
          <Markdown src={d.cashPositionSection} />
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Project progress</div>
        <Card padding="default">
          <Markdown src={d.projectProgressSection} />
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Sales</div>
        <Card padding="default">
          <Markdown src={d.salesSection} />
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Investor</div>
        <Card padding="default">
          <Markdown src={d.investorSection} />
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Operations</div>
        <Card padding="default">
          <Markdown src={d.operationsSection} />
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Risks</div>
        <Card padding="default">
          <Markdown src={d.risksSection} />
        </Card>
      </div>

      {d.keyWins.length > 0 && (
        <div>
          <div className="label mb-2.5">Key wins</div>
          <Card padding="default">
            <ul className="list-disc pl-5 text-sm">
              {d.keyWins.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {d.keyConcerns.length > 0 && (
        <div>
          <div className="label mb-2.5">Key concerns</div>
          <Card padding="default">
            <ul className="list-disc pl-5 text-sm">
              {d.keyConcerns.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {d.recommendedActions.length > 0 && (
        <div>
          <div className="label mb-2.5">Recommended actions</div>
          <Card padding="default">
            <ul className="list-disc pl-5 text-sm">
              {d.recommendedActions.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}
