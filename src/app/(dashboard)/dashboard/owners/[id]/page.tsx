import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, KeyRound } from "lucide-react";
import { getOwnerById, listOwnershipShares } from "@/features/owners/services";
import { listAccessGrantsForOwner } from "@/features/access-grants/services";
import { getOwnerRetentionRisk } from "@/features/owners/retention-risk-service";
import { listVillas } from "@/features/villas/services";
import { canManageEntity } from "@/features/auth/permissions";
import { RiskPill } from "@/components/owners/risk-pill";
import { VillaMini } from "@/components/owners/villa-mini";
import { type OwnerInsight } from "@/components/owners/insight-card";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DetailPage } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";
import { DetailActivity, type ActivityEntry } from "@/components/dashboard/detail/detail-activity";
import { DetailRelated, type RelatedItem } from "@/components/dashboard/detail/detail-related";
import { OwnerDetailTabs } from "./_detail-client";
import { OwnerHeaderActions, OwnerInsightPanel } from "./_owner-actions-client";

/**
 * Phase 2.1 PR 2 — Owner detail uses bricks B1 + B2 + B3 + B5 + B6.
 * Activity timeline is the main tab (per template 05 assembly C);
 * Overview / Villas / Statements / Contacts tabs are placeholder
 * shells until 2.2 wires real data sources.
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

  // Lead commission % for the editor — surfaced from the owner's primary
  // active share (display-only; the editor records an audited change).
  const leadShare =
    shares.find((s) => s.status === "active" && s.villaId) ?? shares[0];
  const commissionPct = leadShare ? Math.round(leadShare.sharePercent) : 0;

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

  // PR 2 — synthetic activity timeline. The dedicated
  // `src/features/activity/get-activity.ts` resolver lands in 2.2;
  // until then we surface the few existing signals (shares + grants)
  // as a hand-rolled timeline so the brick has real content.
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

  const overviewPanel = (
    <div className="flex flex-col gap-8 px-7 py-6">
      {/* Rich AI insight card — the worst retention signal with
          Schedule-call / Dismiss CTAs (replaces the bare RiskPill). */}
      {insight && (
        <OwnerInsightPanel ownerId={id} insight={insight} canManage={canManage} />
      )}
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
      <Card style={{ padding: 20 }}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <SourceBadge source={owner.source} />
          <Badge tone={owner.status === "active" ? "success" : "neutral"}>
            {owner.status}
          </Badge>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <SummaryCell label="Email" value={owner.email ?? "—"} />
          <SummaryCell label="Phone" value={owner.phone ?? "—"} />
          <SummaryCell label="Tax residency" value={owner.taxResidency ?? "—"} />
          <SummaryCell
            label="Active shares"
            value={shares.length.toString()}
            hint={`${activeGrants.length} portal grant${activeGrants.length === 1 ? "" : "s"}`}
          />
        </div>
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
      {activity.length === 0 ? (
        <p className="text-sm text-ink-tertiary">No recent activity.</p>
      ) : (
        <Card style={{ padding: 20 }}>
          <DetailActivity entries={activity} />
        </Card>
      )}
    </div>
  );

  const placeholderPanel = (label: string) => (
    <div className="flex flex-col gap-3 px-7 py-12 text-sm text-ink-tertiary">
      <p>{label} lands in Phase 2.2.</p>
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
          { id: "activity", label: "Activity", count: activity.length },
          { id: "statements", label: "Statements" },
          { id: "contacts", label: "Contacts" },
        ]}
        panels={{
          overview: overviewPanel,
          shares: sharesPanel,
          activity: activityPanel,
          statements: placeholderPanel("Statements list"),
          contacts: placeholderPanel("Contacts"),
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

function SummaryCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="text-base text-ink mt-1">{value}</div>
      {hint && <div className="text-[11px] text-ink-tertiary mt-0.5">{hint}</div>}
    </div>
  );
}
