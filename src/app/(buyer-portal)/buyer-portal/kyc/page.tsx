import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  ShieldQuestion,
} from "lucide-react";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { getBuyerKyc, type BuyerKycStatus } from "@/lib/buyer-portal/kyc";
import { SubmitKycForm } from "./_submit-form";

export const metadata: Metadata = { title: "Identity verification · Buyer Portal" };
export const dynamic = "force-dynamic";

const STATE_PILL: Record<BuyerKycStatus, string> = {
  not_started: "bg-muted text-ink-tertiary border-line-soft",
  in_progress: "bg-warning-weak text-warning border-warning/40",
  submitted: "bg-warning-weak text-warning border-warning/40",
  verified: "bg-success-weak text-success border-success/40",
  rejected: "bg-danger-weak text-danger border-danger/40",
  expired: "bg-danger-weak text-danger border-danger/40",
};

const STATE_LABEL: Record<BuyerKycStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted — under review",
  verified: "Verified",
  rejected: "Needs attention",
  expired: "Expired",
};

const STATE_ICON: Record<
  BuyerKycStatus,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  not_started: ShieldQuestion,
  in_progress: Clock,
  submitted: Clock,
  verified: ShieldCheck,
  rejected: ShieldAlert,
  expired: ShieldAlert,
};

export default async function BuyerKycPage() {
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const buyer = session;

  const kyc = await getBuyerKyc(buyer.buyerId);
  const status: BuyerKycStatus = kyc?.status ?? "not_started";
  const pill = STATE_PILL[status];
  const StateIcon = STATE_ICON[status];

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <section>
        <h2 className="font-display text-2xl tracking-wide text-ink mb-1">
          Identity verification
        </h2>
        <p className="text-sm text-ink-secondary">
          Before handover we verify the identity of every buyer (KYC). Confirm
          your details here and submit them for review — our team completes the
          verification and lets you know if anything else is needed.
        </p>
      </section>

      <section className="rounded-lg border border-line-soft bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-5 py-4">
          <div>
            <h3 className="font-display text-lg tracking-wide text-ink">
              {buyer.displayName}
            </h3>
            <p className="text-xs text-ink-tertiary font-mono">
              {buyer.buyerCode}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${pill}`}
          >
            <StateIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {STATE_LABEL[status]}
          </span>
        </header>

        <div className="px-5 py-4 space-y-3">
          {status === "verified" && (
            <p className="text-xs text-success">
              Your identity is verified.
              {kyc?.completedAt
                ? ` Completed ${kyc.completedAt.toISOString().slice(0, 10)}.`
                : ""}{" "}
              No further action is needed.
            </p>
          )}

          {status === "submitted" && (
            <p className="text-xs text-ink-secondary">
              Thank you — your details are submitted and under review by our
              team. We will be in touch if we need anything further.
            </p>
          )}

          {(status === "not_started" || status === "in_progress") && (
            <>
              <p className="text-xs text-ink-secondary">
                {status === "in_progress"
                  ? "Your verification is in progress. When your details are accurate, submit them for review."
                  : "Your verification has not started yet. Confirm your details and submit them to begin."}
              </p>
              <SubmitKycForm />
            </>
          )}

          {(status === "rejected" || status === "expired") && (
            <p className="text-xs text-danger">
              {status === "expired"
                ? "Your verification has expired and needs to be renewed."
                : "Your verification needs attention."}{" "}
              Our team will contact you to re-open it. You will be able to
              re-submit here once they do.
            </p>
          )}
        </div>
      </section>

      <p className="text-xs text-ink-tertiary">
        Identity documents (passport, proof of address) are collected and
        verified directly with your account manager — secure in-portal document
        upload is coming soon. Submitting here lets our team know you are ready
        for the verification step.
      </p>
    </BuyerShell>
  );
}
