import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listInvestorPortalRequests } from "@/lib/development/server/investor-portal-requests/request-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Investor requests · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  submitted: "warn",
  under_review: "info",
  approved: "info",
  executed: "ok",
  rejected: "danger",
  cancelled: "soft",
};

export default async function InvestorRequestsInboxPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Investor requests</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "listInvestorPortalRequests",
    listInvestorPortalRequests(),
    [],
    4000,
  );
  const pending = rows.filter((r) =>
    ["submitted", "under_review"].includes(r.status),
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Investor requests</span>
          </div>
          <h1>Investor portal request inbox</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Withdrawal / reinvest / transfer / capital-call requests submitted by investors via the portal. Review → approve → execute (operator-driven only — no auto-execute).
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No requests yet"
          description="Investors submit requests via the portal at /investor-portal/wallet."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Inbox</div>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Type</th>
                <th scope="col">Investor</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-xs">
                    <Link
                      href={`/development-os/investor-requests/${r.requestCode}`}
                      className="hover:underline"
                    >
                      {r.requestCode}
                    </Link>
                  </td>
                  <td className="text-xs">{r.requestType}</td>
                  <td className="mono text-xs">
                    {r.investorId.slice(0, 8)}
                  </td>
                  <td className="num">
                    ${(Number(r.requestedAmountMinor) / 100).toLocaleString()}{" "}
                    {r.currency}
                  </td>
                  <td>
                    <HandoffBadge tone={STATUS_TONE[r.status] ?? "soft"}>
                      {r.status}
                    </HandoffBadge>
                  </td>
                  <td className="text-xs">
                    {new Date(r.submittedAt).toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DevelopmentShell>
  );
}
