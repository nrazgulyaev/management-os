import type { ReactNode } from "react";
import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listOwnerVillaHealthSnapshots } from "@/features/owner-intelligence/health-services";
import { listAdminReviews } from "@/features/owner-intelligence/reviews-services";
import { listVillas } from "@/features/villas/services";
import type { VillaHealthSnapshot } from "@/lib/db/schema/owner-intelligence";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "Owner intelligence" };
export const dynamic = "force-dynamic";

const STATUS: {
  key: string;
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
  color: string;
}[] = [
  { key: "excellent", label: "Excellent", tone: "success", color: "var(--ok)" },
  { key: "good", label: "Good", tone: "success", color: "var(--sage)" },
  { key: "watch", label: "Watch", tone: "warning", color: "var(--gold)" },
  { key: "attention", label: "Attention", tone: "danger", color: "var(--terra)" },
  { key: "unknown", label: "Unknown", tone: "neutral", color: "var(--ink-4)" },
];
const STATUS_BY_KEY = Object.fromEntries(STATUS.map((s) => [s.key, s]));

function num(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
/** occupancy stored 0–1 (rate) or 0–100; normalise to a percentage. */
function pct(rate: number | null): number | null {
  if (rate === null) return null;
  return rate <= 1.5 ? rate * 100 : rate;
}
function grade(score: number | null): string {
  if (score === null) return "—";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}
/** Health score → retention-risk score (0–1) + level, mirroring the
 *  mock's per-owner risk column. Lower health ⇒ higher risk. */
function risk(score: number | null): { value: string; level: "low" | "mid" | "high"; sub: string } {
  if (score === null) return { value: "—", level: "mid", sub: "no data" };
  const r = Math.max(0, Math.min(1, (100 - score) / 100));
  const level: "low" | "mid" | "high" = r >= 0.6 ? "high" : r >= 0.4 ? "mid" : "low";
  const sub = level === "high" ? "high" : level === "mid" ? "rising" : "low";
  return { value: r.toFixed(2), level, sub };
}
function mean(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

type Insight = {
  tone: "up" | "down" | "flag" | "star";
  icon: string;
  title: string;
  body: ReactNode;
};

export default async function OwnerIntelligenceHub() {
  const { allowed } = await requireCabinetAccess("owners");
  if (!allowed) return <CabinetGate cabinet="Owner intelligence" />;
  const [snapshots, reviews, villas] = await Promise.all([
    listOwnerVillaHealthSnapshots(),
    listAdminReviews({ limit: 100 }),
    listVillas(),
  ]);

  const villaMap = new Map(
    villas.map((v) => [v.id, { code: v.unitCode, project: v.projectName }]),
  );

  // Latest snapshot per villa (rows arrive newest-first).
  const latest = new Map<string, VillaHealthSnapshot>();
  for (const s of snapshots) if (!latest.has(s.villaId)) latest.set(s.villaId, s);
  const snaps = [...latest.values()].sort(
    (a, b) => (num(b.healthScore) ?? -1) - (num(a.healthScore) ?? -1),
  );

  const attentionSnaps = snaps.filter(
    (s) => s.healthStatus === "attention" || s.healthStatus === "watch",
  );
  const attention = attentionSnaps.length;
  const avgHealth = mean(snaps.map((s) => num(s.healthScore)));
  const avgOcc = mean(snaps.map((s) => pct(num(s.occupancyRate))));
  const avgRating = mean(snaps.map((s) => num(s.averageReviewRating)));
  const negativeReviews = reviews.filter(
    (r) => r.sentiment === "negative" || (r.rating ?? 5) < 3.5,
  ).length;

  const statusCounts = STATUS.map((st) => ({
    ...st,
    count: snaps.filter((s) => s.healthStatus === st.key).length,
  }));
  const total = snaps.length || 1;
  const barVillas = snaps.slice(0, 16);

  const codeFor = (id: string) =>
    villaMap.get(id)?.code ?? id.slice(0, 8);

  // Insights feed — derived from the live health + review signals.
  const insights: Insight[] = [];
  const topPerformer = snaps[0];
  if (topPerformer && (num(topPerformer.healthScore) ?? 0) >= 70) {
    insights.push({
      tone: "up",
      icon: "↗",
      title: `${codeFor(topPerformer.villaId)} · strongest health (${(num(topPerformer.healthScore) ?? 0).toFixed(0)}/100)`,
      body: (
        <>
          Leading the portfolio ·{" "}
          <strong>grade {grade(num(topPerformer.healthScore))}</strong> · keep
          the owner brief on occupancy and review momentum.
        </>
      ),
    });
  }
  const perfectRating = snaps.find((s) => (num(s.averageReviewRating) ?? 0) >= 4.9);
  if (perfectRating) {
    insights.push({
      tone: "star",
      icon: "★",
      title: `${codeFor(perfectRating.villaId)} · guest rating ${(num(perfectRating.averageReviewRating) ?? 0).toFixed(1)}`,
      body: (
        <>
          Near-perfect reviews · <strong>referral opportunity</strong> · surface
          at the next owner review.
        </>
      ),
    });
  }
  for (const s of attentionSnaps.slice(0, 3)) {
    const isAttention = s.healthStatus === "attention";
    insights.push({
      tone: isAttention ? "flag" : "down",
      icon: isAttention ? "!" : "↘",
      title: `${codeFor(s.villaId)} · ${isAttention ? "needs attention" : "on watch"} (${(num(s.healthScore) ?? 0).toFixed(0)}/100)`,
      body: (
        <>
          {s.maintenanceTicketsOpen} open ticket
          {s.maintenanceTicketsOpen === 1 ? "" : "s"} ·{" "}
          {pct(num(s.occupancyRate)) !== null
            ? `${(pct(num(s.occupancyRate)) as number).toFixed(0)}% occupancy`
            : "occupancy unknown"}{" "}
          · review the {isAttention ? "save plan" : "health drivers"}.
        </>
      ),
    });
  }
  if (negativeReviews > 0) {
    insights.push({
      tone: "flag",
      icon: "!",
      title: `${negativeReviews} negative review${negativeReviews === 1 ? "" : "s"} on file`,
      body: (
        <>
          Sentiment flagged across recent stays ·{" "}
          <strong>respond before the next statement</strong>.
        </>
      ),
    });
  }
  const activeInsights = insights.length;
  const churnRisk = snaps.filter((s) => risk(num(s.healthScore)).level === "high").length;
  const upgradeOpp = perfectRating ? 1 : 0;

  return (
    <>
      <div className="page-header oi-header-flush">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Owner intelligence</span>
          </div>
          <h1>
            Insights <em className="text-terra italic">· {activeInsights} active</em>
          </h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Why your villa earned what it did — health snapshots, occupancy, and
            review signals, scored into retention risk per villa. The owner-side
            projection only ever sees the owner-safe shape; guest contact info
            and access secrets stay internal.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/owner-intelligence/rebuild" className="btn btn-secondary btn-sm">
            Rebuild events →
          </Link>
          <Link href="/dashboard/owner-intelligence/health" className="btn btn-accent btn-sm">
            Health reports →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Villas tracked" value={String(snaps.length)} sub={`${snapshots.length} snapshots`} />
        <Kpi
          label="Avg health"
          value={avgHealth !== null ? `${avgHealth.toFixed(0)}/100` : "—"}
          sub={avgHealth !== null ? `grade ${grade(avgHealth)}` : "no data"}
          tone={avgHealth !== null && avgHealth >= 70 ? "success" : undefined}
        />
        <Kpi
          label="On watch / attention"
          value={String(attention)}
          sub={attention > 0 ? "need review" : "all healthy"}
          tone={attention > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Avg occupancy"
          value={avgOcc !== null ? `${avgOcc.toFixed(0)}%` : "—"}
          sub="across snapshots"
        />
        <Kpi
          label="Avg guest rating"
          value={avgRating !== null ? avgRating.toFixed(1) : "—"}
          sub={`${negativeReviews} negative review${negativeReviews === 1 ? "" : "s"}`}
          tone={avgRating !== null ? "gold" : undefined}
        />
      </div>

      <DbStatusNotice />

      {/* Hero body — insights feed + per-villa retention risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-[18px]">
        <div className="card p-5">
          <h3 className="display-md flex items-baseline gap-2.5">
            Insights <em className="text-terra text-[16px]">· today</em>
          </h3>
          <div className="label mt-1">
            {churnRisk} churn-risk · {upgradeOpp} upgrade · derived 06:00
          </div>
          <div className="mt-3.5 flex flex-col gap-2.5">
            {activeInsights === 0 ? (
              <p className="text-[13px] text-ink-3 italic">
                No insights yet — generate health snapshots to surface signals.
              </p>
            ) : (
              insights.map((ins, i) => (
                <div key={i} className={`oi-insight ${ins.tone}`}>
                  <div className="ic" aria-hidden>
                    {ins.icon}
                  </div>
                  <div>
                    <div className="nm">{ins.title}</div>
                    <div className="body">{ins.body}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="display-md flex items-baseline gap-2.5">
            Retention risk <em className="text-terra text-[16px]">· per villa</em>
          </h3>
          <div className="label mt-1">Latest snapshot · health-scored</div>
          <div className="mt-3.5 flex flex-col gap-[7px]">
            {snaps.length === 0 ? (
              <p className="text-[13px] text-ink-3 italic">No snapshots yet.</p>
            ) : (
              snaps.slice(0, 8).map((s) => {
                const v = villaMap.get(s.villaId);
                const score = num(s.healthScore);
                const r = risk(score);
                const g = grade(score).toLowerCase();
                const occ = pct(num(s.occupancyRate));
                return (
                  <Link
                    key={s.id}
                    href={`/dashboard/owner-intelligence/health/${s.villaId}`}
                    className={`oi-risk-row ${r.level === "high" ? "high" : r.level === "mid" ? "mid" : ""}`}
                  >
                    <div className="nm">
                      {codeFor(s.villaId)}
                      <span className="meta">
                        {v?.project ?? "—"} ·{" "}
                        {occ !== null ? `${occ.toFixed(0)}% occ` : "occ —"} ·{" "}
                        {s.bookedNights} nts
                      </span>
                    </div>
                    <span className={`grade ${["a", "b", "c", "d"].includes(g) ? g : "c"}`}>
                      {grade(score)}
                    </span>
                    <span className={`risk ${r.level}`}>
                      {r.value}
                      <span className="sub">{r.sub}</span>
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 2-up: status mix + per-villa score bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-[18px]">
        <div className="card p-5">
          <h3 className="display-sm">Health status mix</h3>
          <div className="label mt-1">Latest snapshot per villa</div>
          <div className="mt-3.5 flex flex-col gap-2.5">
            {statusCounts.map((s) => (
              <div key={s.key}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span>{s.label}</span>
                  <span className="num">{s.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--cream-deep)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="display-sm">Health score · per villa</h3>
          <div className="label mt-1">Top {barVillas.length} by score</div>
          {barVillas.length === 0 ? (
            <p className="text-[13px] text-ink-3 italic mt-4">No snapshots yet.</p>
          ) : (
            <>
              <div className="mt-3.5 flex items-end gap-1.5 h-[140px]">
                {barVillas.map((s) => {
                  const score = num(s.healthScore) ?? 0;
                  const color = STATUS_BY_KEY[s.healthStatus]?.color ?? "var(--ink-3)";
                  return (
                    <div
                      key={s.id}
                      title={`${codeFor(s.villaId)} · ${score.toFixed(0)}/100 · ${s.healthStatus}`}
                      className="flex-1 rounded-t-[3px]"
                      style={{ height: `${Math.max(score, 3)}%`, background: color }}
                    />
                  );
                })}
              </div>
              <div className="mt-2.5 flex justify-between text-[11px] text-ink-3">
                <span>highest</span>
                <span>lowest</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Per-villa health table */}
      <h2 className="display text-[22px] font-normal mt-8 mb-3.5">Per-villa health</h2>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Villa</th>
              <th scope="col">Project</th>
              <th scope="col">Health</th>
              <th scope="col" className="num">Occupancy</th>
              <th scope="col" className="num">Booked nights</th>
              <th scope="col" className="num">Open tickets</th>
              <th scope="col" className="num">Avg rating</th>
              <th scope="col">Period</th>
            </tr>
          </thead>
          <tbody>
            {snaps.length === 0 ? (
              <TableEmpty colSpan={8}>No health snapshots yet. Generate them from the health reports
                  page.</TableEmpty>
            ) : (
              snaps.map((s) => {
                const v = villaMap.get(s.villaId);
                const st = STATUS_BY_KEY[s.healthStatus];
                const score = num(s.healthScore);
                const occ = pct(num(s.occupancyRate));
                const rating = num(s.averageReviewRating);
                return (
                  <tr key={s.id}>
                    <td className="mono">
                      <Link
                        href={`/dashboard/owner-intelligence/health/${s.villaId}`}
                        className="hover:text-terra"
                      >
                        {v?.code ?? s.villaId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="text-[12px] text-ink-3">{v?.project ?? "—"}</td>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <Badge tone={st?.tone ?? "neutral"}>{s.healthStatus}</Badge>
                        <span className="mono text-[11px] text-ink-3">
                          {score !== null ? `${score.toFixed(0)}/100` : "—"}
                        </span>
                      </span>
                    </td>
                    <td className="num">{occ !== null ? `${occ.toFixed(0)}%` : "—"}</td>
                    <td className="num">{s.bookedNights}</td>
                    <td className="num">{s.maintenanceTicketsOpen}</td>
                    <td className="num">{rating !== null ? rating.toFixed(1) : "—"}</td>
                    <td className="mono text-[11px] text-ink-3">
                      {fmtDate(s.periodStart)} → {fmtDate(s.periodEnd)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Related surfaces */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
        {[
          { href: "/dashboard/owner-intelligence/calendar", title: "Calendar", detail: "Internal, full villa context" },
          { href: "/dashboard/owner-intelligence/reviews", title: "Reviews", detail: `${reviews.length} on file` },
          { href: "/dashboard/owner-intelligence/revenue", title: "Revenue mix", detail: "Direct vs OTA per owner" },
          { href: "/dashboard/owner-intelligence/preferences", title: "Owner preferences", detail: "Calendar display defaults" },
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
    </>
  );
}
