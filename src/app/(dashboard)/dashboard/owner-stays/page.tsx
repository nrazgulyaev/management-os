import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import {
  listOwnerStayRequests,
  listOwnerStayPolicies,
  listEquivalenceGroups,
} from "@/features/owner-stays/services";

export const metadata = { title: "Owner stays" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "info" | "neutral" | "danger"
> = {
  approved: "success",
  requires_relocation: "warning",
  pending_admin_approval: "info",
  completed: "neutral",
  rejected: "danger",
};

function money(minor: number, currency: string | null): string {
  return `${currency ?? ""} ${Math.round(minor / 100).toLocaleString()}`.trim();
}

export default async function OwnerStaysOverview() {
  const [allRequests, pending, requiresRelocation, approved, policies, groups] =
    await Promise.all([
      listOwnerStayRequests({ limit: 50 }),
      listOwnerStayRequests({ status: "pending_admin_approval", limit: 50 }),
      listOwnerStayRequests({ status: "requires_relocation", limit: 50 }),
      listOwnerStayRequests({ status: "approved", limit: 50 }),
      listOwnerStayPolicies({ status: "active" }),
      listEquivalenceGroups(),
    ]);

  const queuedCharge = [...pending, ...requiresRelocation, ...approved].reduce(
    (s, r) => s + (r.estimatedTotalOwnerChargeMinor ?? 0),
    0,
  );
  const currency =
    allRequests.find((r) => r.currency)?.currency ??
    policies.find((p) => p.currency)?.currency ??
    "";

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Owner stays</span>
          </div>
          <h1>Owner stays</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Owners welcome — quietly, fairly. Free-night quota, peak-season rules,
            relocation suggestions, transparent compensation. Approved stays
            materialise as owner_stay calendar blocks (not rental revenue).
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/owner-stays/equivalence-groups" className="btn btn-secondary btn-sm">
            Equivalence groups →
          </Link>
          <Link href="/dashboard/owner-stays/policies" className="btn btn-secondary btn-sm">
            Policies →
          </Link>
          <Link href="/dashboard/owner-stays/requests" className="btn btn-accent btn-sm">
            Requests →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Pending approval"
          value={String(pending.length)}
          sub="need review"
          tone={pending.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Needs relocation"
          value={String(requiresRelocation.length)}
          sub={requiresRelocation.length > 0 ? "guest conflict" : "none"}
          tone={requiresRelocation.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Approved"
          value={String(approved.length)}
          sub="active"
          tone={approved.length > 0 ? "success" : undefined}
        />
        <Kpi label="Active policies" value={String(policies.length)} sub={`${groups.length} equivalence groups`} />
        <Kpi label="Owner charge queued" value={money(queuedCharge, currency)} sub="to statements" tone="gold" />
      </div>

      {/* Requests */}
      <div className="flex items-end justify-between mt-2 mb-3.5">
        <h2 className="display text-[22px] font-normal" id="requests">Requests</h2>
        <Link
          href="/dashboard/owner-stays/requests"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All requests →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th>Request</th>
              <th>Owner</th>
              <th>Villa</th>
              <th>Stay</th>
              <th className="num">Nights</th>
              <th className="num">Charge</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {allRequests.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-ink-3 italic py-8">
                  No owner-stay requests yet.
                </td>
              </tr>
            ) : (
              allRequests.slice(0, 12).map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[11px] text-ink-3">
                    <Link
                      href={`/dashboard/owner-stays/requests/${r.id}`}
                      className="hover:text-terra"
                    >
                      {r.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td>{r.ownerName ?? "—"}</td>
                  <td className="mono">{r.villaCode ?? "—"}</td>
                  <td className="mono text-[12px]">
                    {r.requestedStart} → {r.requestedEnd}
                  </td>
                  <td className="num">{r.billableNights}</td>
                  <td className="num mono text-[12px]">
                    {money(r.estimatedTotalOwnerChargeMinor, r.currency)}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Policies + surfaces */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-3.5">
        <div className="card p-5">
          <h3 className="display-sm">Policies · {policies.length} active</h3>
          {policies.length === 0 ? (
            <p className="text-[13px] text-ink-3 italic mt-3">No active policies.</p>
          ) : (
            <ul className="clean p-0 mt-3">
              {policies.slice(0, 6).map((p) => (
                <li key={p.id} className="py-2 border-b border-line-soft last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] text-ink">{p.policyName}</span>
                    <Badge tone="info">{p.projectName ?? p.villaCode ?? "global"}</Badge>
                  </div>
                  <div className="text-[12px] text-ink-3 mt-0.5">
                    {p.freeNightsPerYear} free nights/yr · {p.compensationModel.replace(/_/g, " ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {[
            { href: "/dashboard/owner-stays/policies", title: "Policies", detail: `${policies.length} active` },
            { href: "/dashboard/owner-stays/equivalence-groups", title: "Equivalence groups", detail: `${groups.length} groups` },
            { href: "/dashboard/bookings/rates", title: "Rate plans", detail: "Used by the stay estimator" },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="card p-4 block hover:border-line-strong transition-colors"
            >
              <div className="text-ink font-medium text-[14px]">{c.title}</div>
              <div className="text-[12px] text-ink-3 mt-1">{c.detail}</div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
