import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listInvestorPortalRequests } from "@/lib/development/server/investor-portal-requests/request-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Investor requests · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  submitted: "warning",
  under_review: "info",
  approved: "info",
  executed: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export default async function InvestorRequestsInboxPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Investor requests" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Investor requests" },
        ]}
        eyebrow={`${pending.length} pending · ${rows.length} total`}
        title="Investor portal request inbox"
        description="Withdrawal / reinvest / transfer / capital-call requests submitted by investors via the portal. Review → approve → execute (operator-driven only — no auto-execute)."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No requests yet"
          description="Investors submit requests via the portal at /investor-portal/wallet."
        />
      ) : (
        <Section eyebrow="Inbox" title="All requests (most recent first)">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Type</TH>
                <TH>Investor</TH>
                <TH>Amount</TH>
                <TH>Status</TH>
                <TH>Submitted</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/investor-requests/${r.requestCode}`}
                      className="hover:underline"
                    >
                      {r.requestCode}
                    </Link>
                  </TD>
                  <TD className="text-xs">{r.requestType}</TD>
                  <TD className="font-mono text-xs">
                    {r.investorId.slice(0, 8)}
                  </TD>
                  <TDNum>
                    ${(Number(r.requestedAmountMinor) / 100).toLocaleString()}{" "}
                    {r.currency}
                  </TDNum>
                  <TD>
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {r.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs">
                    {new Date(r.submittedAt).toISOString().slice(0, 16).replace("T", " ")}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
