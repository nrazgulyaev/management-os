import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { OwnerStatementPreview } from "@/components/owner/owner-statement-preview";
import { AIPayoutExplainer } from "@/components/owner/ai-payout-explainer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, MessageCircleQuestion } from "lucide-react";

export const metadata = { title: "Statements" };

const archive = [
  { period: "Mar 2026", villa: "Eternal 07", net: "Rp 78.0M", status: "Published" },
  { period: "Feb 2026", villa: "Eternal 07", net: "Rp 95.2M", status: "Published" },
  { period: "Jan 2026", villa: "Eternal 07", net: "Rp 71.6M", status: "Published" },
  { period: "Mar 2026", villa: "Enso S5", net: "Rp 91.4M", status: "Published" },
  { period: "Feb 2026", villa: "Enso S5", net: "Rp 88.7M", status: "Published" },
  { period: "Jan 2026", villa: "Enso S5", net: "Rp 79.9M", status: "Published" },
];

export default function StatementsPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        breadcrumbs={[{ label: "Portfolio", href: "/owner" }, { label: "Statements" }]}
        title="Statements"
        description="Your signed monthly statements. Download PDFs, drill into any line, or ask the Investor Assistant for an explanation grounded in citations."
      />

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-label">Selected</span>
          <span className="text-sm text-ink">Eternal 07 · March 2026</span>
          <Badge tone="success">Approved</Badge>
          <Badge tone="outline">Hash signed</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link href="#ai-explain">
              <MessageCircleQuestion className="w-4 h-4" strokeWidth={1.75} />
              Ask about this statement
            </Link>
          </Button>
          <Button>
            <Download className="w-4 h-4" strokeWidth={1.75} />
            Download PDF
          </Button>
        </div>
      </div>

      <OwnerStatementPreview />

      <section id="ai-explain" className="scroll-mt-24 flex flex-col gap-4">
        <div>
          <span className="text-label">Investor Assistant</span>
          <h2 className="text-display text-[26px] md:text-[32px] leading-tight font-medium text-ink mt-2">
            Ask why a number changed.
          </h2>
          <p className="text-sm text-ink-secondary mt-2 max-w-2xl leading-relaxed">
            The assistant cites the exact ledger rows behind any answer. If the
            data isn't in your scope, it tells you and offers to open a
            clarification ticket to the Finance Manager.
          </p>
        </div>
        <AIPayoutExplainer />
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <span className="text-label">Archive</span>
          <span className="text-xs text-ink-tertiary">Going back to 2022</span>
        </div>
        <div className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
          {archive.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 p-5 hover:bg-muted/30 transition-colors"
            >
              <div>
                <div className="text-ink font-medium">{s.period}</div>
                <div className="text-xs text-ink-tertiary mt-0.5">
                  {s.villa}
                </div>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-mono tabular-nums text-sm text-ink">
                  {s.net}
                </span>
                <span className="text-xs text-success">{s.status}</span>
                <Button size="sm" variant="ghost">
                  Open
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
