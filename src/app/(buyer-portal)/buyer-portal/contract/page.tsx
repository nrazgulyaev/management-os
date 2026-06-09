import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, FileSignature, Clock, Receipt } from "lucide-react";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import {
  getBuyerContractDetails,
  type BuyerContractSignState,
  type BuyerContractMilestone,
} from "@/lib/buyer-portal/contracts";
import type { BuyerInvoiceState } from "@/lib/buyer-portal/invoices";
import { formatMoneyMinor } from "@/lib/money";
import { SignContractForm } from "./_sign-form";

export const metadata: Metadata = { title: "Contract · Buyer Portal" };
export const dynamic = "force-dynamic";

const STATE_PILL: Record<BuyerContractSignState, string> = {
  fully_signed: "bg-success-weak text-success border-success/40",
  signed_by_you: "bg-success-weak text-success border-success/40",
  awaiting_signature: "bg-warning-weak text-warning border-warning/40",
  not_signable: "bg-muted text-ink-tertiary border-line-soft",
};

const STATE_LABEL: Record<BuyerContractSignState, string> = {
  fully_signed: "Fully signed",
  signed_by_you: "Signed by you",
  awaiting_signature: "Awaiting your signature",
  not_signable: "Not available",
};

const MILESTONE_PILL: Record<string, string> = {
  paid: "bg-success-weak text-success border-success/40",
  partially_paid: "bg-warning-weak text-warning border-warning/40",
  overdue: "bg-danger-weak text-danger border-danger/40",
  invoiced: "bg-muted text-ink-secondary border-line-soft",
  pre_invoiced: "bg-muted text-ink-secondary border-line-soft",
  pending: "bg-muted text-ink-secondary border-line-soft",
  waived: "bg-muted text-ink-tertiary border-line-soft",
  cancelled: "bg-muted text-ink-tertiary border-line-soft",
};

const INVOICE_PILL: Record<BuyerInvoiceState, string> = {
  paid: "bg-success-weak text-success border-success/40",
  due: "bg-warning-weak text-warning border-warning/40",
  overdue: "bg-danger-weak text-danger border-danger/40",
  void: "bg-muted text-ink-tertiary border-line-soft line-through",
};

function MilestoneRow({ m }: { m: BuyerContractMilestone }) {
  const pill = MILESTONE_PILL[m.status] ?? MILESTONE_PILL.pending;
  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-tertiary">
              {String(m.sequence).padStart(2, "0")}
            </span>
            <span className="text-sm text-ink">{m.name}</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${pill}`}
            >
              {m.status.replace(/_/g, " ")}
            </span>
          </div>
          <div className="mt-1 text-xs text-ink-tertiary">
            {m.expectedDueDate ? `Due ${m.expectedDueDate}` : "No due date"}
            {m.status === "paid" && m.paidAt && (
              <> · paid {m.paidAt.toISOString().slice(0, 10)}</>
            )}
          </div>
          {/* Per-milestone invoice (operator-issued, due/paid). */}
          {m.invoice && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-ink-secondary">
                Invoice {m.invoice.invoiceNumber}
              </span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${INVOICE_PILL[m.invoice.state]}`}
              >
                {m.invoice.state}
              </span>
              <span className="text-[11px] text-ink-tertiary">
                due {m.invoice.dueDate}
              </span>
            </div>
          )}
          {/* Receipt for a paid milestone → its document in the vault. */}
          {m.receipt && (
            <Link
              href="/buyer-portal/documents"
              className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-success hover:underline"
            >
              <Receipt className="h-3 w-3" strokeWidth={1.75} />
              {m.receipt.receiptNumber
                ? `Receipt ${m.receipt.receiptNumber}`
                : "Payment receipt"}{" "}
              — view in Documents
            </Link>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm font-mono text-ink">
            {formatMoneyMinor(m.expectedAmountUsdMinor, "USD")}
          </div>
          {m.paidAmountUsdMinor > 0n && m.status !== "paid" && (
            <div className="text-[11px] text-ink-tertiary">
              {formatMoneyMinor(m.paidAmountUsdMinor, "USD")} paid
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default async function BuyerContractPage() {
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const buyer = session;

  const contracts = await getBuyerContractDetails(buyer.buyerId);

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <section>
        <h2 className="font-display text-2xl tracking-wide text-ink mb-1">
          Contract
        </h2>
        <p className="text-sm text-ink-secondary">
          Your purchase agreement in one place — the build-phase payment
          schedule, the invoice and receipt for each phase, and your electronic
          signature. Your typed name is captured as your legal e-signature; our
          team counter-signs to complete the contract.
        </p>
      </section>

      {contracts.length === 0 ? (
        <div className="rounded-lg border border-line-soft bg-surface p-6 text-sm text-ink-secondary">
          No contract is ready for you yet. Once your purchase agreement is
          prepared it appears here for review and signature.
        </div>
      ) : (
        <div className="space-y-6">
          {contracts.map((c) => {
            const pill = STATE_PILL[c.signState];
            const StateIcon =
              c.signState === "fully_signed" || c.signState === "signed_by_you"
                ? CheckCircle2
                : c.signState === "awaiting_signature"
                  ? Clock
                  : FileSignature;
            return (
              <section
                key={c.contractGroupId}
                className="rounded-lg border border-line-soft bg-surface"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-5 py-4">
                  <div>
                    <h3 className="font-display text-lg tracking-wide text-ink">
                      {c.villaLabel}
                    </h3>
                    <p className="text-xs text-ink-tertiary">
                      Contract dated {c.contractDate}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${pill}`}
                  >
                    <StateIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {STATE_LABEL[c.signState]}
                  </span>
                </header>

                <div className="px-5 py-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-ink-tertiary">
                        Total contract value
                      </div>
                      <div className="text-base font-mono text-ink">
                        {formatMoneyMinor(c.totalContractValueUsdMinor, "USD")}
                      </div>
                    </div>
                    {c.milestones.length > 0 && (
                      <div className="text-right">
                        <div className="text-sm font-mono text-ink">
                          {formatMoneyMinor(c.paidTotalUsdMinor, "USD")} /{" "}
                          {formatMoneyMinor(c.scheduledTotalUsdMinor, "USD")}
                        </div>
                        <div className="text-xs text-ink-tertiary">
                          paid of scheduled
                        </div>
                      </div>
                    )}
                    {c.signedByYou && c.signedByYouAt && (
                      <div className="text-right text-xs text-ink-tertiary">
                        Signed by{" "}
                        <span className="text-ink-secondary">
                          {c.signerName}
                        </span>{" "}
                        on {c.signedByYouAt.toISOString().slice(0, 10)}
                      </div>
                    )}
                  </div>

                  {c.signState === "awaiting_signature" && (
                    <SignContractForm
                      contractGroupId={c.contractGroupId}
                      defaultName={buyer.displayName}
                    />
                  )}

                  {c.signState === "signed_by_you" && (
                    <p className="text-xs text-ink-secondary">
                      Thank you — your signature is recorded. The contract
                      completes once our team counter-signs.
                    </p>
                  )}

                  {c.signState === "fully_signed" && (
                    <p className="text-xs text-success">
                      This contract is fully signed.
                      {c.fullySignedAt
                        ? ` Completed ${c.fullySignedAt.toISOString().slice(0, 10)}.`
                        : ""}
                    </p>
                  )}

                  {c.signState === "not_signable" && (
                    <p className="text-xs text-ink-tertiary">
                      This contract is not currently available for signature.
                      Please contact your account manager.
                    </p>
                  )}
                </div>

                {/* Build-phase payment schedule — milestones + invoice + receipt. */}
                <div className="border-t border-line-soft">
                  <div className="flex items-center justify-between px-5 pt-4 pb-1">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                      Build-phase payment schedule
                    </h4>
                    <Link
                      href="/buyer-portal/payments"
                      className="text-xs text-ink-secondary hover:text-ink hover:underline"
                    >
                      Make a payment →
                    </Link>
                  </div>
                  {c.milestones.length === 0 ? (
                    <p className="px-5 py-3 text-xs text-ink-tertiary">
                      Your payment schedule has not been issued yet. It appears
                      here once your contract milestones are set up.
                    </p>
                  ) : (
                    <ol className="divide-y divide-line-soft">
                      {c.milestones.map((m) => (
                        <MilestoneRow key={m.id} m={m} />
                      ))}
                    </ol>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="text-xs text-ink-tertiary">
        Your signature, the time, and your device details are recorded for the
        legal record. A signed copy is filed in your Documents. To confirm a
        transfer you have made, open the{" "}
        <Link
          href="/buyer-portal/payments"
          className="text-ink-secondary hover:underline"
        >
          Payments
        </Link>{" "}
        page.
      </p>
    </BuyerShell>
  );
}
