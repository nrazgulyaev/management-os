import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { buyerUnitAssignments } from "@/lib/db/schema/buyers";
import {
  paymentIntents,
  paymentProcessorConnections,
} from "@/lib/db/schema/payment-processors";
import { contractGroups, contractMilestones } from "@/lib/db/schema/sales";
import { villas } from "@/lib/db/schema/projects";
import { formatMoneyMinor } from "@/lib/money";
import {
  getBuyerInvoices,
  type BuyerInvoice,
  type BuyerInvoiceState,
} from "@/lib/buyer-portal/invoices";
import {
  getBuyerReceiptsByMilestone,
  type BuyerReceipt,
} from "@/lib/buyer-portal/receipts";
import { MarkPaidButton } from "./_mark-paid-button";
import { PayOnlineButton } from "./_pay-online-button";

export const metadata: Metadata = { title: "Payments · Buyer Portal" };
export const dynamic = "force-dynamic";

type MilestoneRow = {
  id: string;
  sequence: number;
  name: string;
  status: string;
  expectedAmountUsdMinor: bigint;
  paidAmountUsdMinor: bigint;
  expectedDueDate: string | null;
  paidAt: Date | null;
  /** True when the org has a configured + active Xendit connection. */
  onlinePayEnabled: boolean;
  /** True when an unexpired online checkout is already open. */
  hasOpenCheckout: boolean;
};

type VillaLadder = {
  villaId: string;
  villaLabel: string;
  villaStatus: string;
  milestones: MilestoneRow[];
};

const STATUS_PILL: Record<string, string> = {
  paid: "bg-success-weak text-success border-success/40",
  partially_paid: "bg-warning-weak text-warning border-warning/40",
  overdue: "bg-danger-weak text-danger border-danger/40",
  invoiced: "bg-muted text-ink-secondary border-line-soft",
  pre_invoiced: "bg-muted text-ink-secondary border-line-soft",
  pending: "bg-muted text-ink-secondary border-line-soft",
  waived: "bg-muted text-ink-tertiary border-line-soft",
  cancelled: "bg-muted text-ink-tertiary border-line-soft",
};

const PAYABLE_STATUSES = new Set([
  "pending",
  "pre_invoiced",
  "invoiced",
  "partially_paid",
  "overdue",
]);

const INVOICE_PILL: Record<BuyerInvoiceState, string> = {
  paid: "bg-success-weak text-success border-success/40",
  due: "bg-warning-weak text-warning border-warning/40",
  overdue: "bg-danger-weak text-danger border-danger/40",
  void: "bg-muted text-ink-tertiary border-line-soft line-through",
};

const INVOICE_LABEL: Record<BuyerInvoiceState, string> = {
  paid: "paid",
  due: "due",
  overdue: "overdue",
  void: "void",
};

export default async function BuyerPaymentsPage() {
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const db = getDb();
  if (!db) redirect("/buyer-portal/login");
  const buyer = session;

  // 1. The buyer's assigned villas.
  const assignments = await db
    .select({
      unitId: buyerUnitAssignments.unitId,
      status: buyerUnitAssignments.status,
    })
    .from(buyerUnitAssignments)
    .where(eq(buyerUnitAssignments.buyerId, buyer.buyerId));

  const unitIds = assignments.map((a) => a.unitId);

  // Villa display labels (unit code / name) for each assigned villa.
  const villaRows =
    unitIds.length > 0
      ? await db
          .select({
            id: villas.id,
            unitCode: villas.unitCode,
            name: villas.name,
          })
          .from(villas)
          .where(inArray(villas.id, unitIds))
      : [];
  const villaById = new Map(villaRows.map((v) => [v.id, v]));

  // 2. Contract groups for those villas (one ladder source per villa).
  const groups =
    unitIds.length > 0
      ? await db
          .select({
            id: contractGroups.id,
            villaId: contractGroups.villaId,
            organizationId: contractGroups.organizationId,
          })
          .from(contractGroups)
          .where(inArray(contractGroups.villaId, unitIds))
      : [];
  const groupIds = groups.map((g) => g.id);
  const villaIdByGroupId = new Map(groups.map((g) => [g.id, g.villaId]));
  const orgIdByGroupId = new Map(groups.map((g) => [g.id, g.organizationId]));

  // Online payment availability: orgs with a configured + ACTIVE Xendit
  // connection unlock "Pay online" (Xendit hosted invoice — QRIS,
  // e-wallets, bank Virtual Accounts). Without one, the manual
  // "Mark as paid" flow below is the only path — unchanged.
  const orgIds = [
    ...new Set(groups.map((g) => g.organizationId).filter(Boolean)),
  ] as string[];
  const activeXenditOrgRows =
    orgIds.length > 0
      ? await db
          .select({
            organizationId: paymentProcessorConnections.organizationId,
          })
          .from(paymentProcessorConnections)
          .where(
            and(
              inArray(paymentProcessorConnections.organizationId, orgIds),
              eq(paymentProcessorConnections.provider, "xendit"),
              eq(paymentProcessorConnections.status, "active"),
            ),
          )
      : [];
  const onlinePayOrgIds = new Set(
    activeXenditOrgRows.map((r) => r.organizationId),
  );

  // 3. Milestones for those groups, ordered by sequence (the ladder).
  const milestoneRows =
    groupIds.length > 0
      ? await db
          .select({
            id: contractMilestones.id,
            contractGroupId: contractMilestones.contractGroupId,
            sequence: contractMilestones.sequence,
            name: contractMilestones.name,
            status: contractMilestones.status,
            expectedAmountUsdMinor: contractMilestones.expectedAmountUsdMinor,
            paidAmountUsdMinor: contractMilestones.paidAmountUsdMinor,
            expectedDueDate: contractMilestones.expectedDueDate,
            paidAt: contractMilestones.paidAt,
          })
          .from(contractMilestones)
          .where(inArray(contractMilestones.contractGroupId, groupIds))
          .orderBy(
            asc(contractMilestones.contractGroupId),
            asc(contractMilestones.sequence),
          )
      : [];

  // Open online checkouts per milestone ("Resume online payment" label).
  const milestoneIds = milestoneRows.map((m) => m.id);
  const openIntentRows =
    milestoneIds.length > 0 && onlinePayOrgIds.size > 0
      ? await db
          .select({
            linkedContractMilestoneId:
              paymentIntents.linkedContractMilestoneId,
          })
          .from(paymentIntents)
          .where(
            and(
              inArray(paymentIntents.linkedContractMilestoneId, milestoneIds),
              inArray(paymentIntents.lifecycleState, [
                "created",
                "processing",
                "requires_action",
              ]),
            ),
          )
      : [];
  const openCheckoutMilestoneIds = new Set(
    openIntentRows
      .map((r) => r.linkedContractMilestoneId)
      .filter((id): id is string => Boolean(id)),
  );

  // Group milestones by villa (via group → villa).
  const ladderByVilla = new Map<string, VillaLadder>();
  for (const a of assignments) {
    const v = villaById.get(a.unitId);
    ladderByVilla.set(a.unitId, {
      villaId: a.unitId,
      villaLabel: v?.name ?? v?.unitCode ?? `Villa ${a.unitId.slice(0, 8)}`,
      villaStatus: a.status,
      milestones: [],
    });
  }
  for (const m of milestoneRows) {
    const villaId = villaIdByGroupId.get(m.contractGroupId);
    if (!villaId) continue;
    const ladder = ladderByVilla.get(villaId);
    if (!ladder) continue;
    const orgId = orgIdByGroupId.get(m.contractGroupId) ?? null;
    ladder.milestones.push({
      id: m.id,
      sequence: m.sequence,
      name: m.name,
      status: m.status,
      expectedAmountUsdMinor: m.expectedAmountUsdMinor,
      paidAmountUsdMinor: m.paidAmountUsdMinor,
      expectedDueDate: m.expectedDueDate,
      paidAt: m.paidAt,
      onlinePayEnabled: orgId !== null && onlinePayOrgIds.has(orgId),
      hasOpenCheckout: openCheckoutMilestoneIds.has(m.id),
    });
  }

  const ladders = [...ladderByVilla.values()];
  const hasAnyMilestones = ladders.some((l) => l.milestones.length > 0);

  // Issued invoices (operator-issued, read-only here). Map by milestone so each
  // ladder row can surface its invoice number + due/paid state.
  const buyerInvoices = await getBuyerInvoices(buyer.buyerId);
  const invoiceByMilestone = new Map<string, BuyerInvoice>();
  for (const inv of buyerInvoices) {
    // Newest first from the query; keep the first (latest) per milestone.
    if (!invoiceByMilestone.has(inv.contractMilestoneId)) {
      invoiceByMilestone.set(inv.contractMilestoneId, inv);
    }
  }

  // Receipts generated when a milestone was marked paid, keyed by milestone so a
  // paid row can link straight to its receipt in the buyer doc vault.
  const receiptByMilestone: Map<string, BuyerReceipt> =
    await getBuyerReceiptsByMilestone(buyer.buyerId);

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <section>
        <h2 className="font-display text-2xl tracking-wide text-ink mb-1">
          Payments
        </h2>
        <p className="text-sm text-ink-secondary">
          Your installment schedule for each villa you are purchasing. Confirm a
          payment once you have transferred the funds — our team reconciles it
          against the contract.
        </p>
      </section>

      {ladders.length === 0 ? (
        <div className="rounded-lg border border-line-soft bg-surface p-6 text-sm text-ink-secondary">
          No villas assigned yet.
        </div>
      ) : !hasAnyMilestones ? (
        <div className="rounded-lg border border-line-soft bg-surface p-6 text-sm text-ink-secondary">
          Your payment schedule has not been issued yet. It appears here once
          your contract milestones are set up.
        </div>
      ) : (
        <div className="space-y-6">
          {ladders.map((ladder) => {
            const expectedTotal = ladder.milestones.reduce(
              (sum, m) => sum + m.expectedAmountUsdMinor,
              0n,
            );
            const paidTotal = ladder.milestones.reduce(
              (sum, m) => sum + m.paidAmountUsdMinor,
              0n,
            );
            return (
              <section
                key={ladder.villaId}
                className="rounded-lg border border-line-soft bg-surface"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-5 py-4">
                  <div>
                    <h3 className="font-display text-lg tracking-wide text-ink">
                      {ladder.villaLabel}
                    </h3>
                    <p className="text-xs text-ink-tertiary capitalize">
                      {ladder.villaStatus.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono text-ink">
                      {formatMoneyMinor(paidTotal, "USD")} /{" "}
                      {formatMoneyMinor(expectedTotal, "USD")}
                    </div>
                    <div className="text-xs text-ink-tertiary">paid of total</div>
                  </div>
                </header>

                {ladder.milestones.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-ink-tertiary">
                    No installments scheduled yet.
                  </div>
                ) : (
                  <ol className="divide-y divide-line-soft">
                    {ladder.milestones.map((m) => {
                      const pill =
                        STATUS_PILL[m.status] ?? STATUS_PILL.pending;
                      const payable = PAYABLE_STATUSES.has(m.status);
                      const invoice = invoiceByMilestone.get(m.id);
                      const receipt = receiptByMilestone.get(m.id);
                      return (
                        <li
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-ink-tertiary">
                                {String(m.sequence).padStart(2, "0")}
                              </span>
                              <span className="text-sm text-ink">
                                {m.name}
                              </span>
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${pill}`}
                              >
                                {m.status.replace(/_/g, " ")}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-ink-tertiary">
                              {m.expectedDueDate
                                ? `Due ${m.expectedDueDate}`
                                : "No due date"}
                              {m.paidAmountUsdMinor > 0n &&
                                m.status !== "paid" && (
                                  <>
                                    {" · "}
                                    {formatMoneyMinor(
                                      m.paidAmountUsdMinor,
                                      "USD",
                                    )}{" "}
                                    paid so far
                                  </>
                                )}
                              {m.status === "paid" && m.paidAt && (
                                <>
                                  {" · "}paid{" "}
                                  {m.paidAt.toISOString().slice(0, 10)}
                                </>
                              )}
                            </div>
                            {invoice && (
                              <div className="mt-1.5 flex items-center gap-2">
                                <span className="font-mono text-[11px] text-ink-secondary">
                                  Invoice {invoice.invoiceNumber}
                                </span>
                                <span
                                  className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${INVOICE_PILL[invoice.state]}`}
                                >
                                  {INVOICE_LABEL[invoice.state]}
                                </span>
                                <span className="text-[11px] text-ink-tertiary">
                                  due {invoice.dueDate}
                                </span>
                              </div>
                            )}
                            {receipt && (
                              <Link
                                href="/buyer-portal/documents"
                                className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-success hover:underline"
                              >
                                <Receipt
                                  className="h-3 w-3"
                                  strokeWidth={1.75}
                                />
                                {receipt.receiptNumber
                                  ? `Receipt ${receipt.receiptNumber}`
                                  : "Payment receipt"}{" "}
                                — view in Documents
                              </Link>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-sm font-mono text-ink">
                                {formatMoneyMinor(
                                  m.expectedAmountUsdMinor,
                                  "USD",
                                )}
                              </div>
                            </div>
                            {payable && (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {m.onlinePayEnabled && (
                                  <PayOnlineButton
                                    milestoneId={m.id}
                                    hasOpenCheckout={m.hasOpenCheckout}
                                  />
                                )}
                                <MarkPaidButton milestoneId={m.id} />
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="text-xs text-ink-tertiary">
        {onlinePayOrgIds.size > 0 ? (
          <>
            “Pay online” opens a secure checkout (QRIS, e-wallets, bank
            virtual accounts — processed by Xendit, charged in IDR at your
            contract rate). You can also transfer via the instructions in
            your contract and confirm with “Mark as paid”.
          </>
        ) : (
          <>
            Online payment rails are not enabled for your project yet. For
            now, please transfer via the instructions in your contract and
            confirm here.
          </>
        )}
      </p>
    </BuyerShell>
  );
}
