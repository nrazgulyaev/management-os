import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Kpi, SectionHeading, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { mapPoolAll } from "@/lib/db/map-pool";
import {
  getWorkspaceProjectHeader,
  getWorkspaceProjectKpis,
  getWorkspaceProjectRisks,
  getWorkspaceProjectSiteActivity,
} from "@/lib/development/server/workspace/workspace-queries";

/**
 * UNIT build-workspace-roleviews · (b) project drill —
 * `/development-os/workspace/project/[id]`.
 *
 * A workspace-scoped single-project rollup: the command-center KPI strip
 * + attention feed, filtered to one project. This is DISTINCT from the
 * full project detail at `/development-os/projects/[slug]` (14 tabs of
 * land / units / capital / finance / sales / site-ops); the drill is the
 * workspace lens and links OUT to that page for the deep dive — no
 * duplication. Org-scoped (TENANT-1) + project-scoped, read-view only.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const header = await getWorkspaceProjectHeader(id).catch(() => null);
  return {
    title: header ? `Workspace · ${header.name}` : "Workspace · project",
  };
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

const STAGE_BADGE: Record<string, string> = {
  active: "active",
  planning: "planning",
  under_construction: "construction",
  managed: "managed",
};

export default async function WorkspaceProjectDrillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const header = await getWorkspaceProjectHeader(id).catch(() => null);
  if (!header) notFound();

  const [kpis, risks, siteActivity] = await mapPoolAll(
    [
      () => getWorkspaceProjectKpis(id).catch(() => null),
      () => getWorkspaceProjectRisks(id, 6).catch(() => []),
      () => getWorkspaceProjectSiteActivity(id, 6).catch(() => []),
    ] as const,
    3,
  );

  const attentionItems = risks.map((r) => {
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
      title: r.title,
      meta: `${r.category.replace(/_/g, " ")} · ${r.probability} × ${r.impact} = ${r.riskScore}`,
    };
  });

  return (
    <>
      <SectionHeading
        eyebrow={`Workspace · project · ${header.projectCode ?? header.slug}`}
        title={
          <>
            {header.name}
            {attentionItems.length > 0 && (
              <>
                {" "}
                <em>· {attentionItems.length} need you</em>
              </>
            )}
          </>
        }
        subtitle="Workspace lens scoped to this project. Open the full project for land, units, capital, finance, sales and site-ops."
        actions={
          <>
            <Link href="/development-os" className="btn btn-dark btn-sm">
              ← Command center
            </Link>
            <Link
              href={`/development-os/projects/${header.slug}`}
              className="btn btn-amber btn-sm"
            >
              Open full project →
            </Link>
          </>
        }
      />

      {/* KPI strip — portfolio figures scoped to this project. */}
      <div className="grid grid-cols-5 gap-3.5 mb-[18px] max-[900px]:grid-cols-3 max-[600px]:grid-cols-2">
        <Kpi
          label="villas"
          value={kpis && kpis.villas > 0 ? String(kpis.villas) : "—"}
          sub="in this project"
          tone={kpis && kpis.villas > 0 ? "accent" : undefined}
        />
        <Kpi
          label="open risks"
          value={kpis && kpis.openRisks > 0 ? String(kpis.openRisks) : "—"}
          sub="register · open"
          tone={kpis && kpis.openRisks > 0 ? "warn" : undefined}
        />
        <Kpi
          label="open packages"
          value={
            kpis && kpis.openWorkPackages > 0 ? String(kpis.openWorkPackages) : "—"
          }
          sub="planned + in-progress"
        />
        <Kpi
          label="site reports · 14d"
          value={
            kpis && kpis.recentSiteReports > 0 ? String(kpis.recentSiteReports) : "—"
          }
          sub="recent activity"
        />
        <Kpi
          label="bookings · MTD"
          value={
            kpis && kpis.bookingsThisMonth > 0 ? String(kpis.bookingsThisMonth) : "—"
          }
          sub="this month"
        />
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-[18px] mb-[18px] max-[900px]:grid-cols-1">
        {/* Attention feed — risks scoped to this project. */}
        <div>
          <h2 className="display text-[22px] font-normal text-ink m-0 mb-3">
            {attentionItems.length === 0 ? (
              "Nothing needs you on this project"
            ) : (
              <>
                <em>{attentionItems.length} attention</em> · this project
              </>
            )}
          </h2>
          {attentionItems.length === 0 ? (
            <Card className="p-5">
              <p className="text-[13px] text-ink-3 italic m-0">
                No open risks on this project. Items surface here automatically
                as the risk register populates.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2.5">
              {attentionItems.map((a) => (
                <Link
                  key={a.key}
                  href={`/development-os/projects/${header.slug}/risks`}
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

        {/* Right rail — scoped site activity + status. */}
        <div className="flex flex-col gap-[18px]">
          <Card className="p-4">
            <h3 className="display text-[18px] font-normal text-ink m-0 mb-1">
              Status
            </h3>
            <div className="flex gap-2 flex-wrap mt-2">
              <HandoffBadge>{STAGE_BADGE[header.status] ?? header.status}</HandoffBadge>
              <HandoffBadge>{header.managementStatus}</HandoffBadge>
            </div>
            <p className="mono text-[10.5px] text-ink-3 mt-3 mb-0">
              {header.projectCode ?? header.slug}
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="display text-[18px] font-normal text-ink m-0">
              Site activity · recent
            </h3>
            {siteActivity.length === 0 ? (
              <p className="mt-3 text-[13px] text-ink-3 italic m-0">
                No site reports yet for this project. Daily activity surfaces
                here once supervisors file their first log.
              </p>
            ) : (
              <ul className="clean mt-3">
                {siteActivity.map((a, i) => (
                  <li key={`${a.occurredAt}-${i}`}>
                    <span className="mono text-[10px] text-ink-3 w-16">
                      {a.occurredAt}
                    </span>
                    <div className="flex-1">
                      <div className="text-[12.5px] font-medium text-ink">
                        {a.summary}
                      </div>
                      <div className="mono text-[10px] text-ink-3">
                        {a.authorName ?? "—"}
                        {a.workersPresent > 0
                          ? ` · ${a.workersPresent} workers`
                          : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
