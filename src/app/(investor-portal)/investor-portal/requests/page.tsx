import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { ArrowLeft, Wallet, ArrowDownToLine, Repeat } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import {
  RequestLifecycle,
  RequestStatusBadge,
} from "@/components/investor-portal/request-lifecycle";
import { CancelRequestButton } from "@/components/investor-portal/cancel-request-button";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db/client";
import { investorPortalRequests } from "@/lib/db/schema/investor-portal-requests";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import {
  PORTAL_REQUEST_CANCELLABLE,
  PORTAL_REQUEST_TYPE_LABEL,
  type PortalRequestStatus,
  type PortalRequestType,
} from "@/lib/development/constants/investor-request-constants";

export const metadata: Metadata = {
  title: "My requests · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function PortalRequestsPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);

  const db = getDb();
  const requests = db
    ? await db
        .select()
        .from(investorPortalRequests)
        .where(eq(investorPortalRequests.investorId, session.investorId))
        .orderBy(desc(investorPortalRequests.submittedAt))
    : [];

  const open = requests.filter(
    (r) => r.status === "submitted" || r.status === "under_review",
  ).length;

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle="My requests"
    >
      <div className="flex flex-col gap-5">
        <Link
          href="/investor-portal/dashboard"
          className="inline-flex items-center gap-1 text-xs text-ink-tertiary transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back to dashboard
        </Link>

        {/* Page header — mono eyebrow + Space Grotesk display title */}
        <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-4">
              Requests
            </div>
            <h1 className="mt-1.5 font-display text-[29px] font-medium leading-none tracking-[-0.02em] text-ink">
              My requests
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-3">
              Withdrawal, reinvest, and transfer requests you&apos;ve submitted
              against your wallet. Each is reviewed by the Arconique team and
              executed manually — no money moves on submit.
            </p>
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            <Button asChild variant="secondary" size="sm">
              <Link href="/investor-portal/wallet/withdraw">
                <ArrowDownToLine className="h-4 w-4" strokeWidth={1.75} />
                Withdraw
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/investor-portal/wallet/reinvest">
                <Repeat className="h-4 w-4" strokeWidth={1.75} />
                Reinvest
              </Link>
            </Button>
          </div>
        </header>

        {open > 0 && (
          <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-bg-2 px-4 py-2.5 text-xs text-ink-2">
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-amber" />
            {open} request{open === 1 ? "" : "s"} awaiting Arconique review.
          </div>
        )}

        {requests.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-line-soft bg-panel px-6 py-10 text-center shadow-soft-card">
            <Wallet
              className="mx-auto mb-3 h-6 w-6 text-ink-4"
              strokeWidth={1.5}
            />
            <p className="text-sm font-medium text-ink-secondary">
              No requests yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-tertiary">
              Submit a withdrawal, reinvestment, or transfer request from the
              Wallet. The Arconique team reviews every request before execution.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/investor-portal/wallet/withdraw">
                  Request a withdrawal
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/investor-portal/wallet/reinvest">Reinvest cash</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {requests.map((r) => {
              const cancellable = PORTAL_REQUEST_CANCELLABLE.has(
                r.status as PortalRequestStatus,
              );
              return (
                <li
                  key={r.id}
                  className="rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                        <span className="font-mono text-ink-3">
                          {r.requestCode}
                        </span>
                        <span className="text-ink-4">·</span>
                        <span>
                          {PORTAL_REQUEST_TYPE_LABEL[
                            r.requestType as PortalRequestType
                          ] ?? r.requestType.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="mt-1 font-display text-[22px] font-medium tabular-nums tracking-[-0.02em] text-ink">
                        {formatUsdMinor(r.requestedAmountMinor)}{" "}
                        <span className="font-mono text-xs font-normal text-ink-tertiary">
                          {r.currency}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-tertiary">
                        Submitted {new Date(r.submittedAt).toLocaleDateString()}
                        {r.preferredExecutionDate
                          ? ` · preferred ${r.preferredExecutionDate}`
                          : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <RequestStatusBadge status={r.status} />
                      {cancellable && <CancelRequestButton requestId={r.id} />}
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto border-t border-line-soft pt-3.5">
                    <RequestLifecycle status={r.status} />
                  </div>

                  {(r.investorNotes ||
                    (r.status === "rejected" && r.rejectionReason) ||
                    (r.status === "executed" && r.executedAt) ||
                    (r.approvalNotes && r.status !== "rejected")) && (
                    <div className="mt-3.5 flex flex-col gap-2">
                      {r.investorNotes && (
                        <p className="border-l-2 border-line-strong pl-3 text-xs text-ink-secondary">
                          <span className="text-ink-tertiary">Your note: </span>
                          {r.investorNotes}
                        </p>
                      )}
                      {r.status === "rejected" && r.rejectionReason && (
                        <p className="border-l-2 border-danger/40 pl-3 text-xs text-danger">
                          <span className="font-mono uppercase tracking-[0.08em]">
                            Reason:{" "}
                          </span>
                          {r.rejectionReason}
                        </p>
                      )}
                      {r.status === "executed" && r.executedAt && (
                        <p className="text-xs text-success">
                          Executed {new Date(r.executedAt).toLocaleString()} —
                          see your wallet ledger for the resulting movement.
                        </p>
                      )}
                      {r.approvalNotes && r.status !== "rejected" && (
                        <p className="border-l-2 border-line-strong pl-3 text-xs text-ink-secondary">
                          <span className="text-ink-tertiary">
                            Arconique note:{" "}
                          </span>
                          {r.approvalNotes}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PortalShell>
  );
}
