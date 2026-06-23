import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, KeyRound } from "lucide-react";
import { getOwnerById, listOwnershipShares } from "@/features/owners/services";
import { listOwnerStatements } from "@/features/finance/services";
import { formatMoneyMinor } from "@/lib/money";
import { ownerStateMgmtLabel } from "@/features/owner-statements/state-machine";
import { listAccessGrantsForOwner } from "@/features/access-grants/services";
import { getOwnerRetentionRisk } from "@/features/owners/retention-risk-service";
import { listVillas } from "@/features/villas/services";
import { canManageEntity } from "@/features/auth/permissions";
import { RiskPill } from "@/components/owners/risk-pill";
import { VillaMini } from "@/components/owners/villa-mini";
import { type OwnerInsight } from "@/components/owners/insight-card";
import { getOwnerChurnView } from "@/features/owners/retention-churn-service";
import { OwnerChurnPanel } from "./_churn-panel";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DetailPage } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";
import { DetailActivity, type ActivityEntry } from "@/components/dashboard/detail/detail-activity";
import { DetailRelated, type RelatedItem } from "@/components/dashboard/detail/detail-related";
import { RecordTimeline } from "@/components/ui/primitives";
import { listCrmActivities } from "@/features/crm-activity/services";
import { LogActivityComposer } from "@/components/crm/log-activity-composer";
import { OwnerDetailTabs } from "./_detail-client";
import { OwnerHeaderActions, OwnerInsightPanel } from "./_owner-actions-client";
import { RecordTasks } from "@/components/crm-tasks/record-tasks";
import {
  listTasksForSubject,
  listAssignableUsers,
} from "@/features/crm-tasks/services";
import { CrmAnnotationsPanel } from "@/components/crm/crm-annotations-panel";

/**
 * Phase 2.1 PR 2 — Owner detail uses bricks B1 + B2 + B3 + B5 + B6.
 * Activity timeline is the main tab (per template 05 assembly C).
 * Overview / Shares / Churn / Tasks / Activity / Statements / Contacts tabs
 * are all wired to real org-scoped data sources.
 */

export const metadata = { title: "Owner" };
export const dynamic = "force-dynamic";

export default async function OwnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const owner = await getOwnerById(id);
  if (!owner) notFound();
  const allShares = await listOwnershipShares();
  const shares = allShares.filter((s) => s.ownerId === id);
  const grants = await listAccessGrantsForOwner(id);
  const activeGrants = grants.filter((g) => g.status === "active");
  const canManage = await canManageEntity("owner");

  // CRM follow-ups / reminders for this owner (HighLevel-style tasks).
  const [crmTasks, assignableUsers] = await Promise.all([
    listTasksForSubject("owner", id),
    canManage ? listAssignableUsers() : Promise.resolve([]),
  ]);

  // Retention-risk intelligence — run the (previously orphaned) engine over
  // this owner's real statements / anomalies / maintenance.
  const villaIds = [
    ...new Set(shares.map((s) => s.villaId).filter(Boolean)),
  ] as string[];
  const risk = await getOwnerRetentionRisk(id, villaIds).catch(() => null);

  // Villa mini-cards — enrich the owner's villa shares with bedrooms +
  // management model for the side panel chips.
  const allVillas = villaIds.length ? await listVillas() : [];
  const villaById = new Map(allVillas.map((v) => [v.id, v]));
  const ownerVillas = villaIds
    .map((vid) => {
      const v = villaById.get(vid);
      const share = shares.find((s) => s.villaId === vid);
      if (!v) return null;
      return {
        id: vid,
        href: `/dashboard/villas/${v.id}`,
        code: v.unitCode,
        name: v.name ?? undefined,
        bedrooms: v.bedrooms,
        managementModel: share?.model ?? v.managementModel,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Operator commission % for the editor — the persisted per-owner rate
  // (owners.commission_pct, migration 0169). recordCommissionChangeAction
  // writes it and the statement engines read it (else the 20% default). It is
  // a real operator-commission value, NOT the owner's ownership-share percent.
  const commissionPct =
    owner.commissionPct !== null ? Math.round(owner.commissionPct) : 0;

  // Promote the worst risk signal into the rich AI insight card.
  const topSignal =
    risk && risk.signals.length > 0
      ? [...risk.signals].sort((a, b) =>
          a.level === b.level ? 0 : a.level === "flag" ? -1 : b.level === "flag" ? 1 : a.level === "watch" ? -1 : 1,
        )[0]
      : null;
  const insight: OwnerInsight | null = topSignal
    ? {
        id: `${id}:${topSignal.kind}`,
        kind: topSignal.kind,
        level: topSignal.level,
        message: topSignal.reason,
        firedAt: new Date().toISOString().slice(0, 10),
      }
    : null;

  // Owner-CHURN drill-in — score breakdown, signals timeline, save-plan,
  // intervention feed (all on top of the same retention engine).
  const churn = await getOwnerChurnView(id, villaIds).catch(() => null);

  // STATEMENTS tab — the real per-owner statement ledger. listOwnerStatements
  // is org-scoped internally (requireOrgId() + eq(ownerStatements.organizationId));
  // passing { ownerId: id } narrows to this owner. A foreign id simply returns
  // no rows (the inner-join owner filter + org filter cannot cross tenants).
  const statements = await listOwnerStatements({ ownerId: id }).catch(() => []);

  // CRM ACTIVITY TIMELINE (#169) — the real unified feed. Reads the
  // org-scoped `crm_activities` stream (notes, status changes, calls,
  // emails) recorded by operators across the platform. When it is empty
  // (e.g. demo mode, or a brand-new owner) we still surface the few
  // structural signals (shares + grants) below so the brick is never
  // blank — but the live stream is the primary content.
  const crmActivity = await listCrmActivities("owner", id).catch(() => []);

  const shareEntries: ActivityEntry[] = shares.slice(0, 3).map((s) => ({
    id: `share-${s.id}`,
    when: `SHARE · ${s.startsOn}`,
    what: (
      <>
        <strong>{s.sharePercent.toFixed(2)}%</strong> in{" "}
        <em>{s.villaCode ?? s.projectName ?? "—"}</em> · {s.model}
      </>
    ),
    kind: s.status === "active" ? "ok" : "neutral",
  }));
  const grantEntries: ActivityEntry[] = activeGrants.slice(0, 3).map((g) => ({
    id: `grant-${g.id}`,
    when: `PORTAL · ${g.grantType}`,
    what: (
      <>
        Active grant for <em>{g.appUserName ?? g.appUserEmail}</em>
      </>
    ),
    kind: "accent",
  }));
  const activity: ActivityEntry[] = [...shareEntries, ...grantEntries];

  // Onboarded-ago label for the overview KPI strip (mock: "14m ago").
  const onboardedDate = new Date(owner.createdAt);
  const onboardedMonths = Number.isNaN(onboardedDate.getTime())
    ? null
    : Math.max(
        0,
        Math.round(
          (Date.now() - onboardedDate.getTime()) / (30 * 86_400_000),
        ),
      );
  const onboardedLabel =
    onboardedMonths === null
      ? "—"
      : onboardedMonths < 1
        ? "this month"
        : `${onboardedMonths}m ago`;
  const onboardedSub = Number.isNaN(onboardedDate.getTime())
    ? undefined
    : onboardedDate.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
  const activeShareCount = shares.filter((s) => s.status === "active").length;

  const overviewPanel = (
    <div className="flex flex-col gap-8 px-7 py-6">
      {/* Rich AI insight card — the worst retention signal with
          Schedule-call / Dismiss CTAs (replaces the bare RiskPill). */}
      {insight && (
        <OwnerInsightPanel ownerId={id} insight={insight} canManage={canManage} />
      )}

      {/* KPI strip — mirrors the mgmt-p1 owner-detail mock (commission,
          villas/shares, portal grants, onboarded). Derived from the
          already-fetched detail data; no extra round-trip. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[10px]">
        <Kpi
          label="Commission rate"
          value={commissionPct > 0 ? `${commissionPct}%` : "—"}
          sub="operator commission"
        />
        <Kpi
          label="Villas"
          value={String(ownerVillas.length)}
          sub={`${activeShareCount} active share${activeShareCount === 1 ? "" : "s"}`}
        />
        <Kpi
          label="Portal grants"
          value={String(activeGrants.length)}
          sub={activeGrants.length > 0 ? "active" : "none yet"}
          tone={activeGrants.length > 0 ? "success" : undefined}
        />
        <Kpi label="Onboarded" value={onboardedLabel} sub={onboardedSub} />
      </div>
      {risk && (
        <Card style={{ padding: 20 }}>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              Retention risk
            </span>
            <RiskPill level={risk.level} />
            <span className="text-xs text-ink-tertiary">
              {risk.signals.length === 0
                ? "No risk signals — this owner looks healthy."
                : `${risk.signals.length} signal${risk.signals.length === 1 ? "" : "s"}`}
            </span>
          </div>
          {risk.signals.length > 0 && (
            <ul className="flex flex-col gap-2">
              {risk.signals.map((s) => (
                <li key={s.kind} className="flex items-center gap-2 text-sm">
                  <RiskPill level={s.level} />
                  <span className="text-ink-secondary">{s.reason}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-ink-tertiary mt-3">
            Signals: payout drift vs 3-mo avg · statement disputes/revisions ·
            unread anomalies · maintenance open &gt;14d · occupancy YoY.
            Portal-disengagement signal pending a sign-in log.
          </p>
          <p className="text-[11px] text-ink-tertiary mt-1">
            Open the <strong>Churn</strong> tab for the score breakdown,
            save-plan and intervention actions.
          </p>
        </Card>
      )}

      {ownerVillas.length > 0 && (
        <section>
          <div className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium mb-3">
            Villas ({ownerVillas.length})
          </div>
          <div className="flex flex-col gap-2 max-w-[420px]">
            {ownerVillas.map((v) => (
              <VillaMini
                key={v.id}
                href={v.href}
                code={v.code}
                name={v.name}
                bedrooms={v.bedrooms}
                managementModel={v.managementModel}
              />
            ))}
          </div>
        </section>
      )}
      {/* Profile — the source-of-truth record, mock's label/value grid. */}
      <Card padding="default">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h3 className="text-display text-[18px] text-ink font-normal mr-auto">
            Profile
          </h3>
          <SourceBadge source={owner.source} />
          <Badge tone={owner.status === "active" ? "success" : "neutral"}>
            {owner.status}
          </Badge>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-x-3 gap-y-[10px] text-[13.5px]">
          <ProfileRow label="Legal name" value={owner.legalName ?? owner.displayName} />
          <ProfileRow label="Type" value={owner.type.replace("_", " ")} />
          <ProfileRow
            label="Primary contact"
            value={[owner.email, owner.phone].filter(Boolean).join(" · ") || "—"}
          />
          <ProfileRow label="Tax residency" value={owner.taxResidency ?? "—"} />
          <ProfileRow
            label="Commission"
            value={commissionPct > 0 ? `${commissionPct}% operator commission` : "Not set · defaults to 20%"}
          />
          <ProfileRow
            label="Portal access"
            value={`${activeGrants.length} active grant${activeGrants.length === 1 ? "" : "s"}`}
          />
        </dl>
      </Card>

      {/* CRM-CUSTOM-FIELDS-TAGS — editable tags chip-row + custom-fields. */}
      <Card style={{ padding: 20 }}>
        <CrmAnnotationsPanel
          subjectType="owner"
          subjectId={owner.id}
          canManage={canManage}
        />
      </Card>

      <section>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div className="label">Owner-portal access</div>
            <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 4, fontWeight: 500 }}>
              Who can read this owner&apos;s data
            </h2>
            <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>
              Explicit grants replace the v3 email-match heuristic.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/dashboard/owners/${owner.id}/access`}>
              <KeyRound className="w-3.5 h-3.5" strokeWidth={1.75} />
              Manage access
              <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Link>
          </Button>
        </div>
        <div className="rounded-md border border-line-soft bg-surface p-5">
          {activeGrants.length === 0 ? (
            <div className="text-sm text-ink-tertiary">
              No active grants. Owner cannot see statements through the portal yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {activeGrants.map((g) => (
                <li key={g.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">
                    {g.appUserName}{" "}
                    <span className="text-ink-tertiary">· {g.appUserEmail}</span>
                  </span>
                  <Badge tone="outline">{g.grantType}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );

  const sharesPanel = (
    <div className="flex flex-col gap-3 px-7 py-6">
      <div className="label">Holdings</div>
      <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 4, fontWeight: 500 }}>
        Ownership shares
      </h2>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 14px" }}>
        Active and historical participation across villas and pools.
      </p>
      <Table>
        <THead>
          <TR>
            <TH>Subject</TH>
            <TH>Model</TH>
            <TH>Effective</TH>
            <TH>Status</TH>
            <TH className="text-right">Share %</TH>
          </TR>
        </THead>
        <TBody>
          {shares.length === 0 ? (
            <TR>
              <TD colSpan={5} className="text-ink-tertiary text-center py-8">
                No shares recorded.
              </TD>
            </TR>
          ) : (
            shares.map((s) => (
              <TR key={s.id}>
                <TD className="text-ink">
                  {s.villaCode ? `Villa · ${s.villaCode}` : `Project · ${s.projectName}`}
                </TD>
                <TD>
                  <Badge tone="outline">{s.model}</Badge>
                </TD>
                <TD className="text-ink-secondary text-sm">
                  {s.startsOn}
                  {s.endsOn ? ` → ${s.endsOn}` : " → present"}
                </TD>
                <TD>
                  <Badge tone={s.status === "active" ? "success" : "neutral"}>
                    {s.status}
                  </Badge>
                </TD>
                <TDNum>{s.sharePercent.toFixed(2)}%</TDNum>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );

  const activityPanel = (
    <div className="flex flex-col gap-3 px-7 py-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
          Activity timeline
        </span>
        <LogActivityComposer
          subjectType="owner"
          subjectId={owner.id}
          canManage={canManage}
        />
      </div>
      {crmActivity.length > 0 ? (
        <Card style={{ padding: 20 }}>
          <RecordTimeline activities={crmActivity} />
        </Card>
      ) : activity.length === 0 ? (
        <p className="text-sm text-ink-tertiary">
          No recent activity. Use <em>Log activity</em> to record a note, call,
          or email.
        </p>
      ) : (
        <Card style={{ padding: 20 }}>
          <DetailActivity entries={activity} />
        </Card>
      )}
    </div>
  );

  const churnPanel = churn ? (
    <OwnerChurnPanel ownerId={owner.id} view={churn} />
  ) : (
    <div className="flex flex-col gap-3 px-7 py-12 text-sm text-ink-tertiary">
      <p>Churn intelligence is unavailable in demo mode (no database).</p>
    </div>
  );

  const tasksPanel = (
    <RecordTasks
      subjectType="owner"
      subjectId={owner.id}
      tasks={crmTasks}
      assignableUsers={assignableUsers}
      canManage={canManage}
    />
  );

  const STATEMENT_STATUS_TONE: Record<
    string,
    { tone: "success" | "neutral" | "outline"; label: string }
  > = {
    draft: { tone: "neutral", label: "Draft" },
    issued: { tone: "outline", label: "Issued" },
    approved: { tone: "outline", label: "Approved" },
    paid: { tone: "success", label: "Settled" },
    voided: { tone: "neutral", label: "Voided" },
  };

  const statementsPanel = (
    <div className="flex flex-col gap-3 px-7 py-6">
      <div className="label">Owner statements</div>
      <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 4, fontWeight: 500 }}>
        Statements
      </h2>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 14px" }}>
        Generated from the ledger for this owner. Click a statement code to open
        the full breakdown.
      </p>
      <Table>
        <THead>
          <TR>
            <TH>Statement</TH>
            <TH>Villa</TH>
            <TH>Period</TH>
            <TH>Status</TH>
            <TH>Owner state</TH>
            <TH className="text-right">Net payout</TH>
          </TR>
        </THead>
        <TBody>
          {statements.length === 0 ? (
            <TR>
              <TD colSpan={6} className="text-ink-tertiary text-center py-8">
                No statements yet for this owner. Generate from the ledger on the{" "}
                <Link href="/dashboard/finance/statements" className="underline">
                  Statements
                </Link>{" "}
                page.
              </TD>
            </TR>
          ) : (
            statements.map((s) => {
              const status =
                STATEMENT_STATUS_TONE[s.status] ?? { tone: "neutral" as const, label: s.status };
              return (
                <TR key={s.id}>
                  <TD className="text-ink">
                    <Link
                      href={`/dashboard/finance/statements/${s.id}`}
                      className="font-mono text-[12px] hover:underline"
                    >
                      {s.statementCode}
                    </Link>
                  </TD>
                  <TD className="text-ink-secondary text-sm">
                    {s.villaCode ?? s.projectName ?? "—"}
                  </TD>
                  <TD className="text-ink-secondary text-sm">{s.periodLabel}</TD>
                  <TD>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </TD>
                  <TD className="text-ink-tertiary text-[12px]">
                    {ownerStateMgmtLabel(s.ownerState)}
                  </TD>
                  <TDNum className="text-ink">
                    {formatMoneyMinor(s.netPayoutMinor, s.currency)}
                  </TDNum>
                </TR>
              );
            })
          )}
        </TBody>
      </Table>
    </div>
  );

  // CONTACTS tab — the real people attached to this owner: the primary
  // contact on the owner record + every active portal grant (the app users
  // who can read this owner's data). Both are already org-scoped fetches above
  // (getOwnerById + listAccessGrantsForOwner), so nothing leaks across tenants.
  const contactsPanel = (
    <div className="flex flex-col gap-3 px-7 py-6">
      <div className="label">People</div>
      <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 4, fontWeight: 500 }}>
        Contacts
      </h2>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 14px" }}>
        Primary contact on the owner record and everyone with active portal
        access.
      </p>
      <Card padding="default">
        <div className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium mb-3">
          Primary contact
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-x-3 gap-y-[10px] text-[13.5px]">
          <ProfileRow label="Name" value={owner.legalName ?? owner.displayName} />
          <ProfileRow label="Email" value={owner.email ?? "—"} />
          <ProfileRow label="Phone" value={owner.phone ?? "—"} />
        </dl>
      </Card>
      <Card padding="default">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
            Portal access ({activeGrants.length})
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/dashboard/owners/${owner.id}/access`}>
              <KeyRound className="w-3.5 h-3.5" strokeWidth={1.75} />
              Manage access
            </Link>
          </Button>
        </div>
        {activeGrants.length === 0 ? (
          <p className="text-sm text-ink-tertiary m-0">
            No active grants. No one can read this owner&apos;s data through the
            portal yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeGrants.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-ink">
                  {g.appUserName}{" "}
                  <span className="text-ink-tertiary">· {g.appUserEmail}</span>
                </span>
                <Badge tone="outline">{g.grantType}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );

  const related: RelatedItem[] = shares.slice(0, 6).map((s) => ({
    id: s.id,
    href: s.villaId ? `/dashboard/villas/${s.villaId}` : undefined,
    title: <>{s.villaCode ? `Villa · ${s.villaCode}` : `Project · ${s.projectName ?? "—"}`}</>,
    meta: `${s.sharePercent.toFixed(2)}% · ${s.model}`,
  }));

  return (
    <DetailPage>
      {/* B1 — Header */}
      <DetailHeader
        breadcrumb={[
          { label: "Owners", href: "/dashboard/owners" },
          { label: owner.displayName },
        ]}
        title={owner.displayName}
        meta={
          <>
            <span>{owner.type.replace("_", " ")}</span>
            <span>·</span>
            <Badge tone={owner.status === "active" ? "success" : "neutral"}>
              {owner.status}
            </Badge>
            {owner.legalName && (
              <>
                <span>·</span>
                <span>{owner.legalName}</span>
              </>
            )}
          </>
        }
        actions={
          <OwnerHeaderActions
            ctx={{
              ownerId: owner.id,
              ownerName: owner.displayName,
              ownerEmail: owner.email,
              commissionPct,
              canManage,
            }}
          />
        }
      />

      {/* B2 + B3 — tabs + active panel (activity-as-main per template) */}
      <OwnerDetailTabs
        initialId="activity"
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "shares", label: "Shares", count: shares.length },
          { id: "churn", label: "Churn", count: churn?.breakdown.contributions.length },
          { id: "tasks", label: "Tasks", count: crmTasks.filter((t) => t.status === "open").length || undefined },
          { id: "activity", label: "Activity", count: crmActivity.length || activity.length },
          { id: "statements", label: "Statements", count: statements.length || undefined },
          { id: "contacts", label: "Contacts" },
        ]}
        panels={{
          overview: overviewPanel,
          shares: sharesPanel,
          churn: churnPanel,
          tasks: tasksPanel,
          activity: activityPanel,
          statements: statementsPanel,
          contacts: contactsPanel,
        }}
      />

      {/* B5 — Related strip (owner's villas/projects) */}
      <DetailRelated
        eyebrow="Owner's villas"
        items={related}
        single={related.length <= 1}
      />
    </DetailPage>
  );
}

/** A label/value pair in the owner-detail Profile grid (mock pattern:
 *  mono uppercase label in the left column, plain value on the right). */
function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-tertiary">
        {label}
      </dt>
      <dd className="text-ink m-0">{value}</dd>
    </>
  );
}
