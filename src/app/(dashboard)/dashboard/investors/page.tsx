import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ListTableCard, NoItemsYet } from "@/components/ui/primitives";
import { getDb, rowsOf } from "@/lib/db/client";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { startImpersonatingInvestor } from "@/features/investor-portal/impersonation-actions";

/**
 * INVESTOR-AUTH — Investor list + "View as investor" entry point.
 * Super_admin only (per ACL on the impersonation action).
 */

export const metadata = { title: "Investors" };
export const dynamic = "force-dynamic";

interface InvestorRow extends Record<string, unknown> {
  id: string;
  investor_code: string;
  legal_name: string;
  investor_type: string;
  primary_currency: string;
  status: string;
  commitments_count: string;
  total_committed_usd_minor: string;
}

async function viewAsInvestorAction(formData: FormData) {
  "use server";
  const investorId = (formData.get("investorId") as string) ?? "";
  if (!investorId) return;
  await startImpersonatingInvestor(investorId);
}

export default async function InvestorsPage() {
  const ctx = await getCurrentUserContext();
  if (!ctx.appUser) {
    return (
      <div className="flex flex-col gap-10">
        <PageHeader title="Investors" description="Sign in required." />
      </div>
    );
  }
  const canImpersonate = ctx.isSuperAdmin;
  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-10">
        <PageHeader title="Investors" description="DB not configured." />
      </div>
    );
  }
  const rows = await db.execute<InvestorRow>(sql`
    SELECT i.id::text                                          AS id,
           i.investor_code                                     AS investor_code,
           i.legal_name                                        AS legal_name,
           i.investor_type                                     AS investor_type,
           i.primary_currency                                  AS primary_currency,
           i.status                                            AS status,
           COALESCE((SELECT COUNT(*)::text FROM capital_commitments c
              WHERE c.investor_id = i.id AND c.status = 'active'), '0')    AS commitments_count,
           COALESCE((SELECT SUM(committed_amount_usd_minor)::text FROM capital_commitments
              WHERE investor_id = i.id), '0')                  AS total_committed_usd_minor
      FROM investors i
     WHERE i.organization_id = ${ctx.appUser.organizationId}::uuid
     ORDER BY i.investor_code ASC
  `);
  const investors = rowsOf<InvestorRow>(rows);

  function fmtUsd(minor: string): string {
    const v = Number(minor) / 100;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${Math.round(v)}`;
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Portfolio", href: "/dashboard" },
          { label: "Investors" },
        ]}
        title="Investors"
        description="Capital partners across your projects. Click ‘View as investor →’ to open their portal view."
      />

      {investors.length === 0 ? (
        <NoItemsYet
          entityLabel="investors"
          description="Run npm run seed:demo-3-investor to populate the capital ledger demo."
        />
      ) : (
        <ListTableCard
          eyebrow="Capital partners"
          title="All investors"
          count={investors.length}
        >
          <Table>
            <THead>
              <TR>
                <TH>Investor</TH>
                <TH>Type</TH>
                <TH>Currency</TH>
                <TH className="text-right">Commitments</TH>
                <TH className="text-right">Committed (USD)</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {investors.map((i) => (
                <TR key={i.id}>
                  <TD>
                    <div className="text-ink font-medium">{i.legal_name}</div>
                    <div className="font-mono text-xs text-ink-tertiary mt-0.5">
                      {i.investor_code}
                    </div>
                  </TD>
                  <TD>
                    <Badge tone="outline">{i.investor_type.replace(/_/g, " ")}</Badge>
                  </TD>
                  <TD className="font-mono text-sm">{i.primary_currency}</TD>
                  <TD className="text-right tabular-nums">{i.commitments_count}</TD>
                  <TD className="text-right font-mono tabular-nums text-ink">
                    {fmtUsd(i.total_committed_usd_minor)}
                  </TD>
                  <TD>
                    <Badge tone={i.status === "active" ? "success" : "neutral"}>
                      {i.status}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {canImpersonate && (
                      <form action={viewAsInvestorAction}>
                        <input type="hidden" name="investorId" value={i.id} />
                        <button
                          type="submit"
                          className="text-xs text-ink-secondary hover:text-terra px-2 py-1 border border-line-soft rounded transition-colors"
                          title="Open this investor's portal view"
                        >
                          View as investor →
                        </button>
                      </form>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </ListTableCard>
      )}
    </div>
  );
}
