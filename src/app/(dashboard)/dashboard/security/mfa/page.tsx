import Link from "next/link";
import { Card, Kpi } from "@/components/dashboard/primitives";
import { TableEmpty } from "@/components/ui/table-empty";
import { listMfaFactorsForAdmin } from "@/features/security-baseline/mfa-services";
import { safeList } from "@/features/system/db-health";
import { RevokeMfaFactorButton } from "@/components/security/mfa-buttons";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "MFA factors" };
export const dynamic = "force-dynamic";

const STATUS_BADGES: Record<string, string> = {
  verified: "badge-ok",
  pending: "badge-info",
};

export default async function MfaFactorsAdminPage() {
  const { allowed } = await requireCabinetAccess("security");
  if (!allowed) return <CabinetGate cabinet="Security" />;
  const factors = await safeList("mfa.factors", () => listMfaFactorsForAdmin());
  const verifiedCount = factors.value.filter(
    (f) => f.status === "verified",
  ).length;
  const pendingCount = factors.value.filter(
    (f) => f.status === "pending",
  ).length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/security">Security</Link> /{" "}
            <Link href="/dashboard/security/auth">Authentication</Link> /{" "}
            <span>MFA</span>
          </div>
          <h1>MFA factors</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Per-user TOTP enrolment status. Revoking a factor invalidates the
            user&apos;s recovery codes; they will need to enrol again.
          </p>
        </div>
      </div>

      {!factors.ok && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs mb-[18px]">
          {factors.error?.kind === "missing_relation"
            ? "Migration pending — apply 0033_security_baseline_operational_hardening.sql."
            : `Could not load factors: ${factors.error?.message}`}
        </p>
      )}

      <div className="gs-kpis">
        <Kpi label="Factors" value={String(factors.value.length)} sub="on file" />
        <Kpi
          label="Verified"
          value={String(verifiedCount)}
          tone={verifiedCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Pending"
          value={String(pendingCount)}
          tone={pendingCount > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Other"
          value={String(factors.value.length - verifiedCount - pendingCount)}
          sub="revoked / disabled"
        />
      </div>

      <Card padding="none" overflowHidden>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Status</th>
              <th scope="col">Issuer</th>
              <th scope="col">Verified</th>
              <th scope="col">Last used</th>
              <th scope="col">Created</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {factors.value.length === 0 ? (
              <TableEmpty colSpan={7}>No MFA factors on file.</TableEmpty>
            ) : (
              factors.value.map((f) => (
                <tr key={f.id}>
                  <td className="mono text-[11px] text-ink-4">
                    {f.appUserId.slice(0, 8)}…
                  </td>
                  <td>
                    <span
                      className={`badge ${STATUS_BADGES[f.status] ?? "badge-warn"}`}
                    >
                      {f.status}
                    </span>
                  </td>
                  <td className="text-[12px]">{f.issuer}</td>
                  <td className="mono text-[11px] text-ink-4">
                    {f.verifiedAt instanceof Date
                      ? f.verifiedAt.toISOString().slice(0, 16).replace("T", " ")
                      : "—"}
                  </td>
                  <td className="mono text-[11px] text-ink-4">
                    {f.lastUsedAt instanceof Date
                      ? f.lastUsedAt.toISOString().slice(0, 16).replace("T", " ")
                      : "—"}
                  </td>
                  <td className="mono text-[11px] text-ink-4">
                    {f.createdAt instanceof Date
                      ? f.createdAt.toISOString().slice(0, 10)
                      : "—"}
                  </td>
                  <td>
                    {(f.status === "verified" || f.status === "pending") && (
                      <RevokeMfaFactorButton factorId={f.id} />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
