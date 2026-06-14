import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listRatePlans } from "@/features/pricing/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { RatePlanAddButton } from "@/components/pricing/rate-plan-add-button";

export const metadata = { title: "Rate plans" };
export const dynamic = "force-dynamic";

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export default async function RatePlansPage() {
  const [plans, villas, projects] = await Promise.all([
    listRatePlans(),
    listVillas(),
    listProjects(),
  ]);
  const villaOpts = villas.map((v) => ({
    id: v.id,
    label: `${v.unitCode} · ${v.projectName ?? ""}`,
  }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <span>Rate plans</span>
          </div>
          <h1>Rate plans</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-villa or per-project nightly rate + seasons + overrides. Used by
            the owner-stay estimator and (in v9C+) the direct-booking quote
            endpoint.
          </p>
        </div>
        <div className="actions">
          <RatePlanAddButton villas={villaOpts} projects={projectOpts} />
        </div>
      </div>

      <div className="rounded-md border border-info-weak/40 bg-info-weak/20 px-5 py-3 text-xs text-info">
        Basic rate plans are still supported. Dynamic pricing rule sets now
        power the quote engine when configured —
        <Link href="/dashboard/pricing/rule-sets" className="ml-1 underline underline-offset-4">
          manage rule sets →
        </Link>
      </div>

      <div>
        <div className="label mb-2.5">Catalog</div>
        {plans.length === 0 ? (
          <Card padding="default">
            <p className="text-[13px] text-ink-3 italic m-0">
              No rate plans yet.
            </p>
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Scope</th>
                  <th scope="col" className="num">Base nightly</th>
                  <th scope="col">Status</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="row-title">{p.name}</td>
                    <td>
                      {p.villaCode ? `villa ${p.villaCode}` : p.projectName ? `project ${p.projectName}` : "global"}
                    </td>
                    <td className="num">
                      {formatMoney(p.baseNightlyRateMinor, p.baseCurrency)}
                    </td>
                    <td>
                      <HandoffBadge tone={p.status === "active" ? "ok" : "soft"}>
                        {p.status}
                      </HandoffBadge>
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/dashboard/bookings/rates/${p.id}`}
                        className="text-xs text-ink hover:text-terra"
                      >
                        Detail →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
