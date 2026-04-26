import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  getOwnerStatementById,
  listStatementLines,
} from "@/features/finance/services";
import { StatementDetail } from "@/components/finance/statement-detail";
import { AIPayoutExplainer } from "@/components/owner/ai-payout-explainer";

export const metadata = { title: "Statement" };
export const dynamic = "force-dynamic";

export default async function OwnerStatementDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const statement = await getOwnerStatementById(id);
  if (!statement) notFound();

  // Owner audience can only see lines flagged owner_visible. RLS restricts
  // access at the DB level; the audience flag is a UI safeguard.
  const lines = await listStatementLines(id, { ownerVisibleOnly: true });

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        breadcrumbs={[
          { label: "Portfolio", href: "/owner" },
          { label: "Statements", href: "/owner/statements" },
          { label: statement.periodLabel },
        ]}
        title={statement.periodLabel}
        description={`${statement.villaCode ?? statement.projectName ?? "—"} · ${statement.managementModel}`}
        actions={
          <Button asChild variant="secondary">
            <a href={`/owner/statements/${id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4" strokeWidth={1.75} />
              Download PDF
            </a>
          </Button>
        }
      />

      <StatementDetail statement={statement} lines={lines} audience="owner" />

      <section id="ai-explain" className="scroll-mt-24 flex flex-col gap-4">
        <div>
          <span className="text-label">Investor Assistant</span>
          <h2 className="text-display text-[26px] md:text-[32px] leading-tight font-medium text-ink mt-2">
            Why your numbers moved.
          </h2>
          <p className="text-sm text-ink-secondary mt-2 max-w-2xl leading-relaxed">
            Preview only — the assistant runtime arrives in v7. The deterministic
            explanation in the statement footer above is built from your live
            ledger data.
          </p>
        </div>
        <AIPayoutExplainer />
      </section>

      <p className="text-xs text-ink-tertiary">
        Need a clarification?{" "}
        <Link href="/owner/support" className="underline">
          Open a ticket with the Finance Manager
        </Link>
        .
      </p>
    </div>
  );
}
