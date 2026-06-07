import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileSignature } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getContractGroupById } from "@/lib/development/server/contracts";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { DiscountProposalModalForm } from "@/components/development/sales/discount-proposal-modal-form";
import {
  SignContractButton,
  IssueInvoiceButton,
  CancelGroupButton,
} from "./_actions";
import { formatDate, formatUSD } from "@/lib/utils";
import {
  CONTRACT_GROUP_STATUS_LABEL,
  CONTRACT_STATUS_LABEL,
  COMPONENT_TYPE_LABEL,
  TAX_BEARER_LABEL,
} from "@/lib/development/constants/contracts-constants";
import {
  MILESTONE_STATUS_LABEL,
} from "@/lib/development/constants/payment-constants";

export const metadata: Metadata = { title: "Contract · Development OS" };
export const dynamic = "force-dynamic";

function fmtUsdMinor(minor: bigint): string {
  return formatUSD(Number(minor) / 100);
}

const groupTone: Record<string, "neutral" | "accent" | "gold" | "warning" | "danger" | "success"> = {
  draft: "neutral",
  pending_signature: "gold",
  partial_signed: "gold",
  fully_signed: "accent",
  in_payment: "accent",
  completed: "success",
  cancelled: "neutral",
  breached: "danger",
};

const childTone: Record<string, "neutral" | "accent" | "gold" | "danger"> = {
  draft: "neutral",
  pending_signature: "gold",
  signed: "accent",
  cancelled: "danger",
};

const milestoneTone: Record<
  string,
  "neutral" | "accent" | "gold" | "warning" | "danger" | "success"
> = {
  pending: "neutral",
  pre_invoiced: "gold",
  invoiced: "gold",
  partially_paid: "warning",
  paid: "success",
  overdue: "danger",
  waived: "neutral",
  cancelled: "neutral",
};

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, ctx] = await Promise.all([
    getContractGroupById(id),
    getCurrentUserContext(),
  ]);
  if (!detail) notFound();

  const signedCount = detail.contracts.filter((c) => c.status === "signed").length;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Contracts", href: "/development-os/contracts" },
          { label: detail.contactFullName },
        ]}
        eyebrow={`${detail.villaCode} · ${detail.projectName}`}
        title={detail.contactFullName}
        description={
          detail.notes ??
          "Hierarchical contract group: parent record plus child contracts and payment milestones."
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={groupTone[detail.status] ?? "neutral"}>
              {CONTRACT_GROUP_STATUS_LABEL[detail.status] ?? detail.status}
            </Badge>
            {ctx.appUser && (
              <DiscountProposalModalForm
                villaId={detail.villaId}
                contactId={detail.contactId}
                proposedByUserId={ctx.appUser.id}
                originalPriceUsdMinor={detail.totalContractValueUsdMinor}
              />
            )}
            {ctx.appUser &&
              detail.status !== "cancelled" &&
              detail.status !== "completed" && (
                <CancelGroupButton contractGroupId={id} />
              )}
            <Button asChild variant="secondary">
              <Link href="/development-os/contracts">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                All contracts
              </Link>
            </Button>
          </div>
        }
      />

      <Section eyebrow="Summary" title="Contract group">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total value" value={fmtUsdMinor(detail.totalContractValueUsdMinor)} />
          <Stat label="Market price at signing" value={fmtUsdMinor(detail.marketPriceAtSigningUsdMinor)} />
          <Stat label="Signed" value={`${signedCount} / ${detail.contracts.length}`} />
          <Stat label="Date" value={formatDate(detail.contractDate, "long")} />
        </dl>
      </Section>

      <Section
        eyebrow="Documents"
        title={`Child contracts · ${detail.contracts.length}`}
        description="Each row is one signable legal document. The group flips to fully_signed only when every child reaches signed."
      >
        <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 border-b border-line-soft">
              <tr className="text-left">
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">#</th>
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Component</th>
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-right">Amount</th>
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-right">Tax</th>
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-right">Net to seller</th>
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.contracts.map((c) => (
                <tr key={c.id} className="border-b border-line-soft last:border-b-0">
                  <td className="px-4 py-3 font-mono text-xs text-ink-tertiary">{c.sequence}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm text-ink">{c.componentName}</span>
                      <span className="text-[11px] text-ink-tertiary">
                        {COMPONENT_TYPE_LABEL[c.componentType] ?? c.componentType}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-sm text-ink">
                    {fmtUsdMinor(c.amountUsdMinor)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono tabular-nums text-sm text-ink">
                        {fmtUsdMinor(c.taxAmountUsdMinor)}
                      </span>
                      <span className="text-[10px] text-ink-tertiary">
                        {c.taxRate}% · {TAX_BEARER_LABEL[c.taxBearer] ?? c.taxBearer}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-sm text-ink-secondary">
                    {fmtUsdMinor(c.netReceivedBySellerUsdMinor)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge tone={childTone[c.status] ?? "neutral"}>
                      {CONTRACT_STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                    {c.signedAt && (
                      <div className="text-[10px] text-ink-tertiary mt-1 font-mono">
                        {formatDate(c.signedAt, "short")}
                      </div>
                    )}
                    {ctx.appUser &&
                      (c.status === "draft" ||
                        c.status === "pending_signature") && (
                        <SignContractButton contractId={c.id} />
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        eyebrow="Payment cadence"
        title={`Milestones · ${detail.milestones.length}`}
        description="Milestones materialized from the sales scheme at contract creation."
        action={
          detail.salesSchemeName ? (
            <span className="text-xs text-ink-tertiary font-mono">
              Scheme: {detail.salesSchemeName}
            </span>
          ) : null
        }
      >
        {detail.milestones.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-soft bg-muted/30 px-6 py-10 text-center">
            <p className="text-sm text-ink-secondary">
              No milestones — the contract group was created without a sales scheme.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {detail.milestones.map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-line-soft bg-surface px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-ink-tertiary w-6 text-right">
                    {m.sequence}
                  </span>
                  <FileSignature className="w-3.5 h-3.5 text-ink-tertiary" strokeWidth={1.75} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-ink truncate">{m.name}</span>
                    <span className="text-[11px] text-ink-tertiary">
                      {m.collectionPercent}% · trigger: {m.triggerType}
                      {m.triggerValue != null ? ` (${m.triggerValue})` : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex flex-col items-end">
                    <span className="font-mono tabular-nums text-sm text-ink">
                      {fmtUsdMinor(m.expectedAmountUsdMinor)}
                    </span>
                    {m.expectedDueDate && (
                      <span className="text-[10px] text-ink-tertiary font-mono">
                        due {formatDate(m.expectedDueDate, "short")}
                      </span>
                    )}
                  </div>
                  <Badge tone={milestoneTone[m.status] ?? "neutral"}>
                    {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
                  </Badge>
                  {ctx.appUser && m.status === "pending" && (
                    <IssueInvoiceButton milestoneId={m.id} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </DevelopmentShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface px-4 py-3 flex flex-col gap-0.5">
      <span className="text-label">{label}</span>
      <span className="text-sm text-ink font-mono tabular-nums">{value}</span>
    </div>
  );
}
