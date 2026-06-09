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
      <div className="space-y-6">
        <Link
          href="/investor-portal/dashboard"
          className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl tracking-wide text-ink mb-1">
              My requests
            </h2>
            <p className="text-sm text-ink-secondary">
              Withdrawal, reinvest, and transfer requests you&apos;ve submitted
              against your wallet. Each is reviewed by the Arconique team and
              executed manually — no money moves on submit.
            </p>
          </div>
          <div className="hidden sm:flex gap-2 shrink-0">
            <Button asChild variant="secondary" size="sm">
              <Link href="/investor-portal/wallet/withdraw">
                <ArrowDownToLine className="w-4 h-4" strokeWidth={1.75} />
                Withdraw
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/investor-portal/wallet/reinvest">
                <Repeat className="w-4 h-4" strokeWidth={1.75} />
                Reinvest
              </Link>
            </Button>
          </div>
        </div>

        {open > 0 && (
          <p className="text-xs text-ink-tertiary">
            {open} request{open === 1 ? "" : "s"} awaiting Arconique review.
          </p>
        )}

        {requests.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-soft bg-surface px-6 py-10 text-center">
            <Wallet
              className="w-6 h-6 mx-auto text-ink-tertiary mb-3"
              strokeWidth={1.5}
            />
            <p className="text-sm font-medium text-ink-secondary">
              No requests yet
            </p>
            <p className="text-xs text-ink-tertiary mt-2 max-w-md mx-auto leading-relaxed">
              Submit a withdrawal, reinvestment, or transfer request from the
              Wallet. The Arconique team reviews every request before execution.
            </p>
            <div className="flex justify-center gap-2 mt-4">
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
          <ul className="space-y-3">
            {requests.map((r) => {
              const cancellable = PORTAL_REQUEST_CANCELLABLE.has(
                r.status as PortalRequestStatus,
              );
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-line-soft bg-surface p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-ink">
                        <span className="font-mono text-ink-secondary">
                          {r.requestCode}
                        </span>
                        <span>·</span>
                        <span>
                          {PORTAL_REQUEST_TYPE_LABEL[
                            r.requestType as PortalRequestType
                          ] ?? r.requestType.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="text-lg font-medium tabular-nums text-ink mt-1">
                        {formatUsdMinor(r.requestedAmountMinor)}{" "}
                        <span className="text-xs font-normal text-ink-tertiary">
                          {r.currency}
                        </span>
                      </div>
                      <div className="text-xs text-ink-tertiary mt-0.5">
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

                  <div className="border-t border-line-soft pt-3 overflow-x-auto">
                    <RequestLifecycle status={r.status} />
                  </div>

                  {r.investorNotes && (
                    <p className="text-xs text-ink-secondary border-l-2 border-line-soft pl-3">
                      <span className="text-ink-tertiary">Your note: </span>
                      {r.investorNotes}
                    </p>
                  )}
                  {r.status === "rejected" && r.rejectionReason && (
                    <p className="text-xs text-danger border-l-2 border-danger/40 pl-3">
                      <span className="uppercase tracking-wide">Reason: </span>
                      {r.rejectionReason}
                    </p>
                  )}
                  {r.status === "executed" && r.executedAt && (
                    <p className="text-xs text-success">
                      Executed {new Date(r.executedAt).toLocaleString()} — see
                      your wallet ledger for the resulting movement.
                    </p>
                  )}
                  {r.approvalNotes && r.status !== "rejected" && (
                    <p className="text-xs text-ink-secondary border-l-2 border-line-soft pl-3">
                      <span className="text-ink-tertiary">
                        Arconique note:{" "}
                      </span>
                      {r.approvalNotes}
                    </p>
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
