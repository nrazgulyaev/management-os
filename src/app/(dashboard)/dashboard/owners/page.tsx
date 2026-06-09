import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listOwnersForCrm } from "@/features/owners/services";
import { OwnersRowActions } from "@/components/dashboard/owners/owners-row-actions";
import { OnboardOwnerLauncher } from "@/components/owners/onboard-owner-launcher";
import { listVillas } from "@/features/villas/services";
import { TierRing } from "@/components/owners/tier-ring";
import { RiskPill } from "@/components/owners/risk-pill";
import { PortalStatusDot } from "@/components/owners/portal-dot";
import { ListTableCard, NoItemsYet } from "@/components/ui/primitives";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";
import { startImpersonatingOwner } from "@/features/owner-portal/impersonation-actions";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Owners & investors" };
export const dynamic = "force-dynamic";

const statusTone: Record<string, "success" | "gold" | "neutral"> = {
  active: "success",
  onboarding: "gold",
  archived: "neutral",
};

async function viewAsOwnerAction(formData: FormData) {
  "use server";
  const ownerId = (formData.get("ownerId") as string) ?? "";
  if (!ownerId) return;
  await startImpersonatingOwner(ownerId);
}

/** Row tint that mirrors the retention-risk level — flag rows read warm,
 *  watch rows read amber, ok rows stay neutral. Kept subtle so the table
 *  still scans as a director CRM, not an alert board. */
const riskRowClass: Record<string, string> = {
  ok: "",
  watch: "bg-warn-weak/30",
  flag: "bg-danger-weak/30",
};

export default async function OwnersPage() {
  const { allowed } = await requireCabinetAccess("owners");
  if (!allowed) return <CabinetGate cabinet="Owners" />;
  const [owners, ctx, villas] = await Promise.all([
    listOwnersForCrm(),
    getCurrentUserContext(),
    listVillas(),
  ]);
  const source = owners[0]?.source ?? "mock";
  const canImpersonate = ctx.isSuperAdmin;
  const availableVillas = villas.map((v) => ({
    id: v.id,
    label: v.name ? `${v.unitCode} · ${v.name}` : v.unitCode,
  }));

  const activeCount = owners.filter((o) => o.status === "active").length;
  const onboardingCount = owners.filter((o) => o.status === "onboarding").length;
  const archivedCount = owners.filter((o) => o.status === "archived").length;

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Owners &amp; investors</span>
          </div>
          <h1>Owners &amp; investors</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Individuals, companies, and family offices participating across the portfolio.
          </p>
        </div>
        <div className="actions">
          <SourceBadge source={source} />
          <OnboardOwnerLauncher availableVillas={availableVillas} />
        </div>
      </div>

      {owners.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
          <Kpi label="Owners · total" value={String(owners.length)} sub="stakeholders" />
          <Kpi
            label="Active"
            value={String(activeCount)}
            sub="participating"
            tone={activeCount > 0 ? "success" : undefined}
          />
          <Kpi
            label="Onboarding"
            value={onboardingCount > 0 ? String(onboardingCount) : "—"}
            sub="in setup"
            tone={onboardingCount > 0 ? "gold" : undefined}
          />
          <Kpi
            label="Archived"
            value={archivedCount > 0 ? String(archivedCount) : "—"}
            sub="inactive"
          />
        </div>
      )}

      <DbStatusNotice />

      {owners.length === 0 ? (
        <NoItemsYet
          entityLabel="owners"
          description="Add the individuals, companies, and family offices participating in your portfolio."
          addHref="/dashboard/owners/new"
          addLabel="New owner"
        />
      ) : (
        <ListTableCard
          eyebrow="Stakeholders"
          title="All owners & investors"
          count={owners.length}
        >
        <Table>
          <THead>
            <TR>
              <TH>Owner</TH>
              <TH>Tier</TH>
              <TH className="text-right">YTD net</TH>
              <TH>Retention</TH>
              <TH>Portal</TH>
              <TH>Last contact</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {owners.map((o) => (
              <TR key={o.id} className={riskRowClass[o.riskLevel] ?? ""}>
                <TD>
                  <Link
                    href={`/dashboard/owners/${o.id}`}
                    className="text-ink font-medium hover:text-accent"
                  >
                    {o.displayName}
                  </Link>
                  <div className="text-xs text-ink-tertiary mt-0.5">
                    {o.legalName && o.legalName !== o.displayName
                      ? o.legalName
                      : o.type.replace("_", " ")}
                    {o.villaCount > 0 && (
                      <>
                        {" · "}
                        {o.villaCount} villa{o.villaCount === 1 ? "" : "s"}
                      </>
                    )}
                  </div>
                </TD>
                <TD>
                  <TierRing tier={o.tier} verbose />
                </TD>
                <TD className="text-right font-mono text-sm text-ink">
                  {o.ytdNetMinor > 0n
                    ? formatMoneyMinor(o.ytdNetMinor, "USD", { compact: true })
                    : "—"}
                </TD>
                <TD>
                  <RiskPill
                    level={o.riskLevel}
                    reason={
                      o.riskSignalCount > 0
                        ? `${o.riskSignalCount} signal${o.riskSignalCount === 1 ? "" : "s"}`
                        : undefined
                    }
                  />
                </TD>
                <TD>
                  <PortalStatusDot status={o.portalStatus} verbose />
                </TD>
                <TD className="text-ink-secondary text-sm font-mono">
                  {o.lastContact ?? "—"}
                </TD>
                <TD>
                  <Badge tone={statusTone[o.status] ?? "neutral"}>
                    {o.status}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canImpersonate && (
                      <form action={viewAsOwnerAction}>
                        <input type="hidden" name="ownerId" value={o.id} />
                        <button
                          type="submit"
                          className="text-xs text-ink-secondary hover:text-terra px-2 py-1 border border-line-soft rounded transition-colors"
                          title="Open this owner's portal view"
                        >
                          View as owner →
                        </button>
                      </form>
                    )}
                    <OwnersRowActions
                      kind="owner"
                      row={{
                        id: o.id,
                        displayName: o.displayName,
                        detailHref: `/dashboard/owners/${o.id}`,
                        values: {
                          type: o.type,
                          displayName: o.displayName,
                          legalName: o.legalName ?? "",
                          email: o.email ?? "",
                          phone: o.phone ?? "",
                          nationality: o.nationality ?? "",
                          taxResidency: o.taxResidency ?? "",
                          status: o.status,
                        },
                      }}
                    />
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        </ListTableCard>
      )}
    </>
  );
}
