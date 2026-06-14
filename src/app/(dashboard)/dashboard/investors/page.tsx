import Link from "next/link";
import { sql } from "drizzle-orm";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { NoItemsYet } from "@/components/ui/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>Investors</h1>
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              Sign in required.
            </p>
          </div>
        </div>
      </div>
    );
  }
  const canImpersonate = ctx.isSuperAdmin;
  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-10">
        <div className="page-header">
          <div className="left">
            <h1>Investors</h1>
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              DB not configured.
            </p>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Portfolio</Link> / <span>Investors</span>
          </div>
          <h1>Investors</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Capital partners across your projects. Click ‘View as investor →’ to
            open their portal view.
          </p>
        </div>
      </div>

      {investors.length === 0 ? (
        <NoItemsYet
          entityLabel="investors"
          description="Run npm run seed:demo-3-investor to populate the capital ledger demo."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Capital partners</div>
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Investor</th>
                  <th scope="col">Type</th>
                  <th scope="col">Currency</th>
                  <th scope="col" className="num">Commitments</th>
                  <th scope="col" className="num">Committed (USD)</th>
                  <th scope="col">Status</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {investors.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="row-title">{i.legal_name}</div>
                      <div className="mono text-xs text-ink-3 mt-0.5">
                        {i.investor_code}
                      </div>
                    </td>
                    <td>
                      <HandoffBadge tone="soft">
                        {i.investor_type.replace(/_/g, " ")}
                      </HandoffBadge>
                    </td>
                    <td className="mono text-sm">{i.primary_currency}</td>
                    <td className="num">{i.commitments_count}</td>
                    <td className="num text-ink">
                      {fmtUsd(i.total_committed_usd_minor)}
                    </td>
                    <td>
                      <HandoffBadge tone={i.status === "active" ? "ok" : "soft"}>
                        {i.status}
                      </HandoffBadge>
                    </td>
                    <td className="text-right">
                      {canImpersonate && (
                        <form action={viewAsInvestorAction}>
                          <input type="hidden" name="investorId" value={i.id} />
                          <button
                            type="submit"
                            className="btn btn-secondary btn-sm"
                            title="Open this investor's portal view"
                          >
                            View as investor →
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
