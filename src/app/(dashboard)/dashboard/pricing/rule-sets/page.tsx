import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { listPricingRuleSets } from "@/features/dynamic-pricing/services";
import { RuleSetAddButton } from "@/components/dynamic-pricing/rule-set-add-button";

export const metadata = { title: "Pricing rule sets" };
export const dynamic = "force-dynamic";

function statusTone(status: string): "ok" | "warn" | "soft" {
  return status === "active" ? "ok" : status === "paused" ? "warn" : "soft";
}

export default async function RuleSetsPage() {
  const sets = await listPricingRuleSets();
  const active = sets.filter((rs) => rs.status === "active").length;

  return (
    <>
      <div className="page-header !mb-0 !pb-[18px]">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/pricing">Dynamic pricing</Link> / <span>Rule sets</span>
          </div>
          <h1>Pricing rules</h1>
          <p className="text-[13.5px] text-ink-3 mt-2 max-w-[720px]">
            Order matters: top rule wins. Each rule set is the top of a (scope, priority, base)
            triple that drives nightly pricing.
          </p>
        </div>
        <div className="actions">
          <RuleSetAddButton />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mt-[18px] mb-[18px]">
        <div className="kpi">
          <div className="label">Rule sets</div>
          <div className="v">{sets.length}</div>
          <div className="sub">scope / priority / base</div>
        </div>
        <div className="kpi ok">
          <div className="label">Active</div>
          <div className="v">{active}</div>
          <div className="sub">driving nightly prices</div>
        </div>
        <div className="kpi">
          <div className="label">Paused / draft</div>
          <div className="v">{sets.length - active}</div>
          <div className="sub">not applied</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {sets.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-3 m-0">
            No rule sets yet — seed or create one.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Scope</th>
                <th className="num">Base</th>
                <th className="num">Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((rs) => (
                <tr key={rs.id}>
                  <td className="row-title">
                    <Link
                      href={`/dashboard/pricing/rule-sets/${rs.id}`}
                      className="hover:underline underline-offset-4"
                    >
                      {rs.name}
                    </Link>
                    <div className="font-mono text-[10px] text-ink-4 mt-0.5">{rs.ruleSetCode}</div>
                  </td>
                  <td className="capitalize">{rs.scopeType}</td>
                  <td className="num">
                    {(rs.baseRateMinor / 100n).toString()}.
                    {String(rs.baseRateMinor % 100n).padStart(2, "0")} {rs.currency}
                  </td>
                  <td className="num">{rs.priority}</td>
                  <td>
                    <HandoffBadge tone={statusTone(rs.status)}>{rs.status}</HandoffBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
