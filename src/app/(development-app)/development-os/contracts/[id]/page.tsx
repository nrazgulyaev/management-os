import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileSignature } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getContractGroupById } from "@/lib/development/server/contracts";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { DiscountProposalModalForm } from "@/components/development/sales/discount-proposal-modal-form";
import {
  SignContractButton,
  IssueInvoiceButton,
  CancelGroupButton,
  CompleteGroupButton,
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

type BadgeTone =
  | "ok"
  | "warn"
  | "danger"
  | "gold"
  | "info"
  | "amber"
  | "soft"
  | undefined;

const groupTone: Record<string, BadgeTone> = {
  draft: "soft",
  pending_signature: "gold",
  partial_signed: "gold",
  fully_signed: "amber",
  in_payment: "amber",
  completed: "ok",
  cancelled: "soft",
  breached: "danger",
};

const childTone: Record<string, BadgeTone> = {
  draft: "soft",
  pending_signature: "gold",
  signed: "amber",
  cancelled: "danger",
};

const milestoneTone: Record<string, BadgeTone> = {
  pending: "soft",
  pre_invoiced: "gold",
  invoiced: "gold",
  partially_paid: "warn",
  paid: "ok",
  overdue: "danger",
  waived: "soft",
  cancelled: "soft",
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

  // AJB / completion gate (mirrors completeContractGroup's server guards):
  // all non-cancelled child contracts signed + every collectible milestone
  // (not waived/cancelled) paid, from an in_payment | fully_signed group.
  const activeContracts = detail.contracts.filter((c) => c.status !== "cancelled");
  const allSigned =
    activeContracts.length > 0 &&
    activeContracts.every((c) => c.status === "signed");
  const collectibleMilestones = detail.milestones.filter(
    (m) => m.status !== "waived" && m.status !== "cancelled",
  );
  const allMilestonesPaid = collectibleMilestones.every(
    (m) => m.status === "paid",
  );
  const canComplete =
    (detail.status === "in_payment" || detail.status === "fully_signed") &&
    allSigned &&
    allMilestonesPaid;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/contracts">Sales · contract groups</Link>
            <span>/</span>
            <span>{detail.contactFullName}</span>
          </div>
          <h1>
            {detail.contactFullName}{" "}
            <em>· {detail.villaCode}</em>
          </h1>
          <div className="page-header-meta">
            <span>{detail.projectName}</span>
            <span>·</span>
            <span>{fmtUsdMinor(detail.totalContractValueUsdMinor)}</span>
            <span>·</span>
            <span>
              signed {signedCount} / {detail.contracts.length}
            </span>
          </div>
        </div>
        <div className="actions">
          <HandoffBadge tone={groupTone[detail.status] ?? "soft"}>
            {CONTRACT_GROUP_STATUS_LABEL[detail.status] ?? detail.status}
          </HandoffBadge>
          {ctx.appUser && (
            <DiscountProposalModalForm
              villaId={detail.villaId}
              contactId={detail.contactId}
              proposedByUserId={ctx.appUser.id}
              originalPriceUsdMinor={detail.totalContractValueUsdMinor}
            />
          )}
          {ctx.appUser && canComplete && (
            <CompleteGroupButton contractGroupId={id} />
          )}
          {ctx.appUser &&
            detail.status !== "cancelled" &&
            detail.status !== "completed" && (
              <CancelGroupButton contractGroupId={id} />
            )}
          <Link href="/development-os/contracts" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All contracts
          </Link>
        </div>
      </header>

      {detail.notes && (
        <p className="text-ink-secondary text-sm max-w-3xl leading-relaxed -mt-2">
          {detail.notes}
        </p>
      )}

      {/* Revenue-recognition state — collected cash is deferred until the AJB
          (notarial transfer) completes the group; then it's recognised. */}
      {detail.status === "completed" || detail.completedAt ? (
        <div className="rounded-md border border-ok/40 bg-ok/5 px-4 py-2.5 text-sm text-ink-secondary -mt-1">
          Revenue recognised — AJB / transfer completed
          {detail.completedAt
            ? ` on ${formatDate(detail.completedAt, "long")}`
            : ""}
          . Collected sale cash is recognised as revenue.
        </div>
      ) : (
        <div className="rounded-md border border-line-soft bg-muted/30 px-4 py-2.5 text-sm text-ink-secondary -mt-1">
          {canComplete
            ? "All parts signed and all milestones paid — ready for AJB. Use “Mark AJB / complete” to recognise the collected cash as revenue."
            : "Collected cash is deferred until the AJB (notarial transfer). Every contract part must be signed and every milestone paid before completing."}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card px-[18px] py-[14px]">
          <div className="label">Total value</div>
          <div className="font-mono text-[20px] text-ink mt-1.5 tabular-nums">
            {fmtUsdMinor(detail.totalContractValueUsdMinor)}
          </div>
        </div>
        <div className="card px-[18px] py-[14px]">
          <div className="label">Market at signing</div>
          <div className="font-mono text-[20px] text-ink mt-1.5 tabular-nums">
            {fmtUsdMinor(detail.marketPriceAtSigningUsdMinor)}
          </div>
        </div>
        <div className="card px-[18px] py-[14px]">
          <div className="label">Signed</div>
          <div className="font-mono text-[20px] text-ink mt-1.5 tabular-nums">
            {signedCount} / {detail.contracts.length}
          </div>
        </div>
        <div className="card px-[18px] py-[14px]">
          <div className="label">Contract date</div>
          <div className="font-mono text-[14px] text-ink mt-2">
            {formatDate(detail.contractDate, "long")}
          </div>
        </div>
      </div>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <span className="label">
            Child contracts · {detail.contracts.length}
          </span>
          <span className="text-[11px] text-ink-3 max-w-md text-right">
            The group flips to fully_signed only when every child reaches signed.
          </span>
        </div>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Component</th>
                  <th className="num">Amount</th>
                  <th className="num">Tax</th>
                  <th className="num">Net to seller</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono text-xs text-ink-3">
                      {c.sequence}
                    </td>
                    <td className="row-title">
                      {c.componentName}
                      <span className="block text-[11px] text-ink-3 font-normal">
                        {COMPONENT_TYPE_LABEL[c.componentType] ?? c.componentType}
                      </span>
                    </td>
                    <td className="num">{fmtUsdMinor(c.amountUsdMinor)}</td>
                    <td className="num">
                      {fmtUsdMinor(c.taxAmountUsdMinor)}
                      <span className="block text-[10px] text-ink-3">
                        {c.taxRate}% ·{" "}
                        {TAX_BEARER_LABEL[c.taxBearer] ?? c.taxBearer}
                      </span>
                    </td>
                    <td className="num text-ink-3">
                      {fmtUsdMinor(c.netReceivedBySellerUsdMinor)}
                    </td>
                    <td>
                      <HandoffBadge tone={childTone[c.status] ?? "soft"}>
                        {CONTRACT_STATUS_LABEL[c.status] ?? c.status}
                      </HandoffBadge>
                      {c.signedAt && (
                        <div className="text-[10px] text-ink-3 mt-1 font-mono">
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
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <span className="label">Milestones · {detail.milestones.length}</span>
          {detail.salesSchemeName && (
            <span className="text-[11px] text-ink-3 font-mono">
              Scheme: {detail.salesSchemeName}
            </span>
          )}
        </div>
        {detail.milestones.length === 0 ? (
          <div className="card px-6 py-10 text-center">
            <p className="text-sm text-ink-3">
              No milestones — the contract group was created without a sales
              scheme.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {detail.milestones.map((m) => (
              <li
                key={m.id}
                className="card px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-ink-3 w-6 text-right">
                    {m.sequence}
                  </span>
                  <FileSignature
                    className="w-3.5 h-3.5 text-ink-3"
                    strokeWidth={1.75}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-ink truncate">
                      {m.name}
                    </span>
                    <span className="text-[11px] text-ink-3">
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
                      <span className="text-[10px] text-ink-3 font-mono">
                        due {formatDate(m.expectedDueDate, "short")}
                      </span>
                    )}
                  </div>
                  <HandoffBadge tone={milestoneTone[m.status] ?? "soft"}>
                    {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
                  </HandoffBadge>
                  {ctx.appUser && m.status === "pending" && (
                    <IssueInvoiceButton milestoneId={m.id} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </DevelopmentShell>
  );
}
