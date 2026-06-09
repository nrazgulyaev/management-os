import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listOwnersForCrm } from "@/features/owners/services";
import { OnboardOwnerLauncher } from "@/components/owners/onboard-owner-launcher";
import { listVillas } from "@/features/villas/services";
import { NoItemsYet } from "@/components/ui/primitives";
import { getCurrentUserContext, canManageEntity } from "@/features/auth/permissions";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";
import { startImpersonatingOwner } from "@/features/owner-portal/impersonation-actions";
import { formatMoneyMinor } from "@/lib/money";
import { listSavedViews } from "@/features/crm/saved-views/services";
import { listAppUsers } from "@/features/auth/users-service";
import { listTagsForSubjects, listOrgTags } from "@/features/crm-custom-fields/services";
import { OwnersListClient, type OwnerRowVM } from "./_owners-list-client";
import type { FilterFieldDef } from "@/features/crm/saved-views/filter-types";

export const metadata = { title: "Owners & investors" };
export const dynamic = "force-dynamic";

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

/** Advanced-filter fields offered on the owners list. */
const OWNER_FILTER_FIELDS: FilterFieldDef[] = [
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "active", label: "Active" },
      { value: "onboarding", label: "Onboarding" },
      { value: "archived", label: "Archived" },
    ],
  },
  {
    key: "type",
    label: "Type",
    type: "select",
    options: [
      { value: "individual", label: "Individual" },
      { value: "company", label: "Company" },
      { value: "family_office", label: "Family office" },
    ],
  },
  {
    key: "tier",
    label: "Tier",
    type: "select",
    options: [
      { value: "platinum", label: "Platinum" },
      { value: "gold", label: "Gold" },
      { value: "silver", label: "Silver" },
    ],
  },
  {
    key: "riskLevel",
    label: "Retention risk",
    type: "select",
    options: [
      { value: "ok", label: "OK" },
      { value: "watch", label: "Watch" },
      { value: "flag", label: "Flag" },
    ],
  },
  {
    key: "portalStatus",
    label: "Portal",
    type: "select",
    options: [
      { value: "active", label: "Active" },
      { value: "invited", label: "Invited" },
      { value: "not-invited", label: "Not invited" },
    ],
  },
  { key: "nationality", label: "Nationality", type: "text" },
  { key: "taxResidency", label: "Tax residency", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "displayName", label: "Name", type: "text" },
];

export default async function OwnersPage() {
  const { allowed } = await requireCabinetAccess("owners");
  if (!allowed) return <CabinetGate cabinet="Owners" />;
  const [owners, ctx, villas, savedViews, appUsers, canManage, orgTags] =
    await Promise.all([
      listOwnersForCrm(),
      getCurrentUserContext(),
      listVillas(),
      listSavedViews("owners"),
      listAppUsers(),
      canManageEntity("owner"),
      listOrgTags(),
    ]);

  // CRM-CUSTOM-FIELDS-TAGS — tags-per-owner in one round-trip for the
  // list column + filter (the merge-deferred follow-on from #172).
  const tagsBySubject = await listTagsForSubjects(
    "owner",
    owners.map((o) => o.id),
  );
  const source = owners[0]?.source ?? "mock";
  const canImpersonate = ctx.isSuperAdmin;
  const availableVillas = villas.map((v) => ({
    id: v.id,
    label: v.name ? `${v.unitCode} · ${v.name}` : v.unitCode,
  }));
  const assignOptions = appUsers
    .filter((u) => u.status === "active")
    .map((u) => ({ id: u.id, label: u.fullName || u.email }));

  const activeCount = owners.filter((o) => o.status === "active").length;
  const onboardingCount = owners.filter((o) => o.status === "onboarding").length;
  const archivedCount = owners.filter((o) => o.status === "archived").length;

  const rows: OwnerRowVM[] = owners.map((o) => ({
    id: o.id,
    displayName: o.displayName,
    legalName: o.legalName,
    type: o.type,
    tier: o.tier,
    ytdNetLabel:
      o.ytdNetMinor > 0n
        ? formatMoneyMinor(o.ytdNetMinor, "USD", { compact: true })
        : "—",
    riskLevel: o.riskLevel,
    riskSignalCount: o.riskSignalCount,
    portalStatus: o.portalStatus,
    villaCount: o.villaCount,
    lastContact: o.lastContact,
    status: o.status,
    email: o.email,
    phone: o.phone,
    nationality: o.nationality,
    taxResidency: o.taxResidency,
    riskRowClass: riskRowClass[o.riskLevel] ?? "",
    tags: (tagsBySubject.get(o.id) ?? []).map((t) => ({
      id: t.id,
      label: t.label,
      color: t.color,
    })),
  }));

  // The tags filter field offers the org's tag vocabulary as select options;
  // `is`/`is_not` match against an owner's assigned tag ids (OR semantics).
  const filterFields: FilterFieldDef[] = [
    ...OWNER_FILTER_FIELDS,
    {
      key: "tags",
      label: "Tag",
      type: "select",
      options: orgTags.map((t) => ({ value: t.id, label: t.label })),
    },
  ];

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
        <OwnersListClient
          rows={rows}
          fields={filterFields}
          savedViews={savedViews}
          assignOptions={assignOptions}
          canManage={canManage}
          canImpersonate={canImpersonate}
          viewAsOwnerAction={viewAsOwnerAction}
        />
      )}
    </>
  );
}
