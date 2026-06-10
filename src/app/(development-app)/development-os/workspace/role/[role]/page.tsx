import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Kpi, SectionHeading, Card } from "@/components/dashboard/primitives";
import { mapPoolAll } from "@/lib/db/map-pool";
import {
  getLatestQsAnomaly,
  getRiskRadar,
  getDevPortfolioKpis,
  type PortfolioKpis,
} from "@/lib/development/server/cabinets/dev-overview-queries";
import {
  getRoleFraming,
  isCabinetRoleKey,
  listRoleSummaries,
  KPI_LABEL,
  VALID_CABINET_ROLES,
  type KpiKey,
} from "@/lib/development/server/workspace/role-framing";

/**
 * UNIT build-workspace-roleviews · (a) role view —
 * `/development-os/workspace/role/[role]`.
 *
 * The command-center attention feed + KPI strip, framed for ONE RBAC
 * role. It reuses the exact same org-scoped reads the landing
 * (`/development-os`) fetches — `getDevPortfolioKpis`, `getRiskRadar`,
 * `getLatestQsAnomaly` — then *reorders/scopes* them for the role via
 * the pure `role-framing` helper. `[role]` is enumerable from the RBAC
 * config (`VALID_CABINET_ROLES`), so unknown roles 404 and the static
 * params are driven from one source of truth. Read-view only.
 */

export const dynamic = "force-dynamic";

/** Enumerate `[role]` from the RBAC role set — never fabricated. */
export function generateStaticParams(): { role: string }[] {
  return VALID_CABINET_ROLES.map((role) => ({ role }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: string }>;
}): Promise<Metadata> {
  const { role } = await params;
  if (!isCabinetRoleKey(role)) {
    return { title: "Workspace · role" };
  }
  return { title: `Workspace · ${getRoleFraming(role).label}` };
}

type AttnTone = "urgent" | "warn" | "info";

function attnAccentClass(tone: AttnTone): string {
  return tone === "urgent"
    ? "border-l-[3px] border-l-danger"
    : tone === "warn"
      ? "border-l-[3px] border-l-warning"
      : "border-l-[3px] border-l-amber";
}

function attnIconClass(tone: AttnTone): string {
  return tone === "urgent"
    ? "bg-danger-weak text-danger"
    : tone === "warn"
      ? "bg-warning-weak text-warning"
      : "bg-accent-weak text-amber";
}

function kpiTone(key: KpiKey, value: number): "accent" | "warn" | undefined {
  if (value <= 0) return undefined;
  if (key === "openRisks") return "warn";
  if (key === "activeProjects") return "accent";
  return undefined;
}

function kpiValue(kpis: PortfolioKpis | null, key: KpiKey): number {
  return kpis ? kpis[key] : 0;
}

function kpiSub(key: KpiKey): string {
  switch (key) {
    case "activeProjects":
      return "in motion";
    case "activeVillas":
      return "in portfolio";
    case "bookingsThisMonth":
      return "this month";
    case "openRisks":
      return "project_risks register";
    case "openWorkPackages":
      return "planned + in-progress";
    case "recentSiteReports":
      return "last 14 days";
  }
}

export default async function WorkspaceRoleViewPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (!isCabinetRoleKey(role)) notFound();

  const framing = getRoleFraming(role);

  // Same reads the landing fetches — reused, then framed for the role.
  const [latestAnomaly, risks, kpis] = await mapPoolAll(
    [
      () => getLatestQsAnomaly().catch(() => null),
      () => getRiskRadar(6).catch(() => []),
      () => getDevPortfolioKpis().catch(() => null),
    ] as const,
    3,
  );

  // Compose + order the attention feed for the role. The anomaly leads for
  // cost-facing roles (QS/PM/CFO/procurement/exec/admin) and tails for the
  // rest — never hidden. Risks map impact → urgent/warn/info as on the
  // landing. Pure shaping of the already-fetched reads, no new I/O.
  const anomalyItem = latestAnomaly
    ? {
        key: "anomaly",
        tone: "info" as AttnTone,
        icon: "★",
        title: latestAnomaly.title,
        meta: `qs-cost-analyst · ${latestAnomaly.outputCode}`,
        href: "/development-os/ai-agents/qs-cost-analyst",
      }
    : null;

  const riskItems = risks.map((r) => {
    const tone: AttnTone =
      r.impact === "severe" || r.impact === "catastrophic"
        ? "urgent"
        : r.impact === "major"
          ? "warn"
          : "info";
    return {
      key: r.riskId,
      tone,
      icon: tone === "urgent" ? "!" : tone === "warn" ? "∇" : "✦",
      title: `${r.projectCode ? `${r.projectCode} · ` : ""}${r.title}`,
      meta: `${r.category.replace(/_/g, " ")} · ${r.probability} × ${r.impact} = ${r.riskScore}`,
      href: "/development-os/risk-radar",
    };
  });

  const attentionItems = framing.leadsWithAnomaly
    ? [...(anomalyItem ? [anomalyItem] : []), ...riskItems]
    : [...riskItems, ...(anomalyItem ? [anomalyItem] : [])];

  const otherRoles = listRoleSummaries().filter((r) => r.role !== role);

  return (
    <>
      <SectionHeading
        eyebrow={`Workspace · role view · ${framing.label}`}
        title={
          <>
            {framing.label}.{" "}
            {attentionItems.length > 0 && (
              <em>{attentionItems.length} need you.</em>
            )}
          </>
        }
        subtitle={framing.blurb || framing.attentionLens}
        actions={
          <Link
            href="/development-os"
            className="btn btn-dark btn-sm"
          >
            ← Command center
          </Link>
        }
      />

      {/* KPI strip — same six portfolio figures, ordered for the role. */}
      <div className="grid grid-cols-5 gap-3.5 mb-[18px] max-[900px]:grid-cols-3 max-[600px]:grid-cols-2">
        {framing.kpiOrder.slice(0, 5).map((key) => {
          const v = kpiValue(kpis, key);
          return (
            <Kpi
              key={key}
              label={KPI_LABEL[key]}
              value={v > 0 ? String(v) : "—"}
              sub={kpiSub(key)}
              tone={kpiTone(key, v)}
            />
          );
        })}
      </div>

      {/* Attention feed — role-lensed, honest empty state. */}
      <div className="mb-[18px]">
        <h2 className="display text-[22px] font-normal text-ink m-0 mb-1">
          {attentionItems.length === 0 ? (
            "Nothing needs you"
          ) : (
            <>
              <em>{attentionItems.length} attention</em> · {framing.label} view
            </>
          )}
        </h2>
        <p className="mono text-[11px] text-ink-3 m-0 mb-3">
          {framing.attentionLens}
        </p>
        {attentionItems.length === 0 ? (
          <Card className="p-5">
            <p className="text-[13px] text-ink-3 italic m-0">
              No open risks or anomaly runs surfacing for the {framing.label}{" "}
              lens. Items appear here automatically as the risk register and QS
              agents populate.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {attentionItems.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                className={
                  "card grid grid-cols-[32px_1fr_auto] gap-3 items-center px-4 py-3.5 no-underline " +
                  attnAccentClass(a.tone)
                }
              >
                <span
                  className={
                    "w-8 h-8 rounded-lg inline-flex items-center justify-center display text-[15px] " +
                    attnIconClass(a.tone)
                  }
                >
                  {a.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-ink truncate">
                    {a.title}
                  </span>
                  <span className="block mono text-[10.5px] text-ink-3 mt-0.5 truncate">
                    {a.meta}
                  </span>
                </span>
                <span className="text-ink-4" aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Other role lenses — the enumerable RBAC role set. */}
      <Card padding="none" overflowHidden>
        <div className="px-[22px] py-3.5 border-b border-line bg-muted">
          <h2 className="display text-[20px] font-normal text-ink m-0">
            Other role views
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-2 p-5 max-[900px]:grid-cols-2 max-[600px]:grid-cols-1">
          {otherRoles.map((r) => (
            <Link
              key={r.role}
              href={`/development-os/workspace/role/${r.role}`}
              className="px-3 py-2.5 border border-line rounded-[8px] bg-bg-3 no-underline hover:border-amber"
            >
              <div className="display text-[14px] text-ink">{r.label}</div>
              <div className="mono text-[10.5px] text-ink-3 mt-0.5 truncate">
                {r.leadKpis.map((k) => KPI_LABEL[k]).join(" · ")}
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
