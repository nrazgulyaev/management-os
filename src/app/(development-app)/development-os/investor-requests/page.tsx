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

const FILTERS: { v: string; label: string }[] = [
  { v: "pending", label: "Pending" },
  { v: "", label: "All" },
  { v: "submitted", label: "Submitted" },
  { v: "under_review", label: "Under review" },
  { v: "approved", label: "Approved" },
  { v: "executed", label: "Executed" },
  { v: "rejected", label: "Rejected" },
  { v: "cancelled", label: "Cancelled" },
];

export default async function InvestorRequestsInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  // Default the inbox to the actionable queue so the operator lands on work.
  const active = sp.status ?? "pending";
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
  const visible =
    active === "pending"
      ? pending
      : active === ""
        ? rows
        : rows.filter((r) => r.status === active);

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
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {FILTERS.map((f) => {
              const on = active === f.v;
              const count =
                f.v === "pending"
                  ? pending.length
                  : f.v === ""
                    ? rows.length
                    : rows.filter((r) => r.status === f.v).length;
              return (
                <Link
                  key={f.v || "all"}
                  href={`/development-os/investor-requests${f.v ? `?status=${f.v}` : "?status="}`}
                  className={
                    on
                      ? "inline-flex items-center gap-1.5 rounded-full bg-amber border border-amber px-[13px] py-[7px] text-[12.5px] text-carbon"
                      : "inline-flex items-center gap-1.5 rounded-full bg-bg-2 border border-line-2 px-[13px] py-[7px] text-[12.5px] text-ink-2 hover:border-line-3 transition-colors"
                  }
                >
                  {f.label}
                  <span className={on ? "text-carbon/70" : "text-ink-4"}>
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="label mb-2.5">
            Inbox · {visible.length} shown
          </div>
          {visible.length === 0 ? (
            <EmptyState
              title="Nothing in this view"
              description="No requests match this filter. Switch to “All” to see every request."
            />
          ) : (
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
              {visible.map((r) => (
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
                  <td className="text-xs">
                    {r.investorCode ? (
                      <Link
                        href={`/development-os/investors/${r.investorCode}`}
                        className="hover:underline"
                      >
                        {r.investorLegalName ?? r.investorCode}
                      </Link>
                    ) : (
                      <span className="mono text-ink-3">
                        {r.investorId.slice(0, 8)}
                      </span>
                    )}
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
          )}
        </div>
      )}
    </DevelopmentShell>
  );
}
