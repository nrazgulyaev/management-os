import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listMfaFactorsForAdmin } from "@/features/security-baseline/mfa-services";
import { safeList } from "@/features/system/db-health";
import { RevokeMfaFactorButton } from "@/components/security/mfa-buttons";

export const metadata = { title: "MFA factors" };
export const dynamic = "force-dynamic";

export default async function MfaFactorsAdminPage() {
  const factors = await safeList("mfa.factors", () => listMfaFactorsForAdmin());
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Security", href: "/dashboard/security" },
          { label: "Authentication", href: "/dashboard/security/auth" },
          { label: "MFA" },
        ]}
        title="MFA factors"
        description="Per-user TOTP enrolment status. Revoking a factor invalidates the user's recovery codes; they will need to enrol again."
      />
      {!factors.ok && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs">
          {factors.error?.kind === "missing_relation"
            ? "Migration pending — apply 0033_security_baseline_operational_hardening.sql."
            : `Could not load factors: ${factors.error?.message}`}
        </p>
      )}
      <Section eyebrow="Factors" title={`${factors.value.length} on file`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Issuer</th>
                <th className="px-4 py-3">Verified</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {factors.value.map((f) => (
                <tr key={f.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                    {f.appUserId.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        f.status === "verified"
                          ? "success"
                          : f.status === "pending"
                            ? "info"
                            : "warning"
                      }
                    >
                      {f.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">{f.issuer}</td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                    {f.verifiedAt instanceof Date
                      ? f.verifiedAt.toISOString().slice(0, 16).replace("T", " ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                    {f.lastUsedAt instanceof Date
                      ? f.lastUsedAt.toISOString().slice(0, 16).replace("T", " ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                    {f.createdAt instanceof Date
                      ? f.createdAt.toISOString().slice(0, 10)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {(f.status === "verified" || f.status === "pending") && (
                      <RevokeMfaFactorButton factorId={f.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
