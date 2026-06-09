import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, FileSignature, Clock } from "lucide-react";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import {
  getBuyerContracts,
  type BuyerContractSignState,
} from "@/lib/buyer-portal/contracts";
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

export default async function BuyerContractPage() {
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const buyer = session;

  const contracts = await getBuyerContracts(buyer.buyerId);

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <section>
        <h2 className="font-display text-2xl tracking-wide text-ink mb-1">
          Contract
        </h2>
        <p className="text-sm text-ink-secondary">
          Review and electronically sign your purchase agreement. Your typed name
          is captured as your legal e-signature; our team counter-signs to
          complete the contract.
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
                        {formatMoneyMinor(
                          c.totalContractValueUsdMinor,
                          "USD",
                        )}
                      </div>
                    </div>
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
              </section>
            );
          })}
        </div>
      )}

      <p className="text-xs text-ink-tertiary">
        Your signature, the time, and your device details are recorded for the
        legal record. A signed copy is filed in your Documents.
      </p>
    </BuyerShell>
  );
}
