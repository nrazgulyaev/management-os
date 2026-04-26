import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { OwnerStatementPreview } from "@/components/owner/owner-statement-preview";
import { AIPayoutExplainer } from "@/components/owner/ai-payout-explainer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Download, MessageCircleQuestion } from "lucide-react";
import { listOwnerStatements } from "@/features/finance/services";
import { formatMoneyMinor } from "@/lib/money";
import { isDbConfigured } from "@/lib/env";

export const metadata = { title: "Statements" };
export const dynamic = "force-dynamic";

export default async function StatementsPage() {
  // For now, surface every owner-visible statement (issued / approved / paid).
  // Owner identity comes via Supabase RLS in production; the email-link
  // function in migration 0002 handles the scoping at the database layer.
  const dbReady = isDbConfigured();
  const live = dbReady
    ? (await listOwnerStatements({ status: ["issued", "approved", "paid"] })).slice(0, 24)
    : [];

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        breadcrumbs={[{ label: "Portfolio", href: "/owner" }, { label: "Statements" }]}
        title="Statements"
        description="Your signed monthly statements. Drill into any line or ask the Investor Assistant for an explanation grounded in citations."
        actions={<SourceBadge source={live.length > 0 ? "db" : "mock"} />}
      />

      {live.length > 0 ? (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-label">Live · {live.length} published statements</span>
            <span className="text-xs text-ink-tertiary">
              Owner-visible scope only
            </span>
          </div>
          <div className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {live.map((s) => (
              <Link
                key={s.id}
                href={`/owner/statements/${s.id}`}
                className="flex items-center justify-between gap-4 p-5 hover:bg-muted/30 transition-colors"
              >
                <div>
                  <div className="text-ink font-medium">{s.periodLabel}</div>
                  <div className="text-xs text-ink-tertiary mt-0.5">
                    {s.villaCode ?? s.projectName ?? s.ownerName} · {s.managementModel}
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <span className="font-mono tabular-nums text-sm text-ink">
                    {formatMoneyMinor(s.netPayoutMinor, s.currency)}
                  </span>
                  <Badge tone={s.status === "paid" ? "success" : "info"}>{s.status}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-label">Selected (demo)</span>
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
          <div className="mt-6">
            <OwnerStatementPreview />
          </div>
        </section>
      )}

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
    </div>
  );
}
