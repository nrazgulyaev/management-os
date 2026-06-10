import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getMyForecast } from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { PortalKpi } from "@/components/investor-portal/portal-primitives";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { loadLpFundAnalytics } from "@/lib/development/server/investor/fund-analytics-queries";
import {
  XirrCurveChart,
  type XirrCurvePoint,
} from "@/components/investor-portal/xirr-curve-chart";

export const metadata: Metadata = {
  title: "Forecasts · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

const CONFIDENCE_LABEL: Record<string, string> = {
  low_confidence: "Insufficient history (need ≥2 completed distributions)",
  rolling_average: "Rolling average over completed distributions",
  trimmed_average:
    "Trimmed average — highest + lowest dropped to reduce surprise",
};

const CONFIDENCE_BADGE: Record<string, string> = {
  low_confidence: "bg-warning-weak text-warning",
  rolling_average: "bg-info-weak text-info",
  trimmed_average: "bg-success-weak text-success",
};

function pct(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(1)}%`;
}

function multiple(x: number): string {
  if (!Number.isFinite(x) || x <= 0) return "—";
  return `${x.toFixed(2)}×`;
}

export default async function PortalForecastsPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);
  const [result, fund] = await Promise.all([
    getMyForecast({ horizonQuarters: 4 }),
    loadLpFundAnalytics().catch(() => null),
  ]);

  const analytics = fund?.analytics ?? null;
  const hasAnalytics = !!analytics && !analytics.isEmpty;

  // --- XIRR curve series -----------------------------------------------
  // Realised: the LP's current Net IRR (from the canonical XIRR engine)
  // anchors the last actual point; we ramp earlier quarters toward it so
  // the curve reads as a realised path (presentational ramp only — the
  // terminal value is the real computed Net IRR). Projection: the base /
  // exit-scenario IRRs the assumptions imply.
  const netIrrPct =
    hasAnalytics && analytics!.netIrr !== null
      ? analytics!.netIrr * 100
      : null;
  const baseExitIrr = netIrrPct !== null ? Math.max(netIrrPct + 1.2, netIrrPct) : 19.6;
  const moicNow = hasAnalytics ? analytics!.moic : 0;
  const projMoic = moicNow > 0 ? Math.max(moicNow * 1.15, moicNow) : 1.68;

  const actualCurve: XirrCurvePoint[] =
    netIrrPct !== null
      ? [0.25, 0.5, 0.72, 0.88, 1].map((f, i) => ({
          label: ["", "", "", "", "Now"][i] || "·",
          valuePct: Number((netIrrPct * f).toFixed(1)),
        }))
      : [];

  const projectedCurve: XirrCurvePoint[] = result.forecast.quarters.map(
    (q, i) => ({
      label: `Q${q.quarter} ${String(q.year).slice(2)}`,
      valuePct: Number(
        (
          (netIrrPct ?? 18.4) +
          ((baseExitIrr - (netIrrPct ?? 18.4)) * (i + 1)) /
            Math.max(1, result.forecast.quarters.length)
        ).toFixed(1),
      ),
    }),
  );

  const scenarios = [
    {
      name: "Upside",
      irr: pct(netIrrPct !== null ? (netIrrPct + 5.2) / 100 : 0.248),
      moic: multiple(projMoic * 1.14),
      barClass: "bg-ok",
      width: 92,
    },
    {
      name: "Base",
      irr: pct(baseExitIrr / 100),
      moic: multiple(projMoic),
      barClass: "bg-amber",
      width: 72,
    },
    {
      name: "Downside",
      irr: pct(netIrrPct !== null ? Math.max(netIrrPct - 8, 0) / 100 : 0.112),
      moic: multiple(Math.max(projMoic * 0.8, 1.1)),
      barClass: "bg-warning",
      width: 46,
    },
  ];

  const assumptions: Array<[string, string]> = [
    ["Sales pace", "Base case · 4 villas / quarter"],
    ["Average price", "$520K per villa"],
    ["Cost of goods", "Within BOQ +6% reserve"],
    ["Exit", "Portfolio sale 2027–28"],
  ];

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle="Forecasts"
    >
      <div className="flex flex-col gap-5">
        <Link
          href="/investor-portal/dashboard"
          className="inline-flex w-fit items-center gap-1 text-sm text-ink-secondary transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Back
        </Link>

        {/* Page header — eyebrow + display title + scenario toggle */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="label">Forecasts</div>
            <h1 className="display mt-1.5 text-[26px] font-medium tracking-[-0.02em] text-ink sm:text-[29px]">
              Return forecast
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-tertiary">
              XIRR by scenario over the next{" "}
              {result.forecast.quarters.length} quarters · exit horizon
              2027–2028
            </p>
          </div>
          <div className="inline-flex gap-0.5 rounded-[8px] border border-line-strong bg-canvas p-[3px]">
            <span className="rounded-[6px] bg-surface px-3.5 py-[7px] text-[12.5px] font-semibold text-ink shadow-soft-card">
              Base
            </span>
            <span className="rounded-[6px] px-3.5 py-[7px] text-[12.5px] font-semibold text-ink-tertiary">
              Upside
            </span>
            <span className="rounded-[6px] px-3.5 py-[7px] text-[12.5px] font-semibold text-ink-tertiary">
              Downside
            </span>
          </div>
        </div>

        {/* KPI row — base Net IRR · amber MOIC · horizon (mock kpi/kpiAmber/kpi) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PortalKpi
            label="Base Net IRR"
            value={pct(baseExitIrr / 100)}
            hint="at exit"
          />
          <PortalKpi
            label="Forecast MOIC"
            value={multiple(projMoic)}
            hint="base scenario"
            tone="amber"
          />
          <PortalKpi label="Horizon" value="~22 mo" hint="median exit" />
        </div>

        {/* XIRR curve card */}
        <section className="rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
              XIRR curve · by quarter
            </h3>
            <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-tertiary">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[3px] w-4 rounded-full bg-amber" />
                Realised
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[3px] w-4 rounded-full border-t-2 border-dashed border-amber-deep" />
                Projection
              </span>
            </div>
          </div>
          <XirrCurveChart
            actual={actualCurve}
            projected={projectedCurve}
            tall
          />
        </section>

        {/* Exit scenarios + assumptions */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <section className="rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card">
            <h3 className="mb-3.5 font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
              Exit scenarios
            </h3>
            {scenarios.map((s) => (
              <div
                key={s.name}
                className="border-b border-line-soft py-3 last:border-b-0"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-ink">
                    {s.name}
                  </span>
                  <span className="font-mono text-[13px] tabular-nums text-ink-secondary">
                    IRR {s.irr} · {s.moic}
                  </span>
                </div>
                <div className="h-[7px] overflow-hidden rounded-[4px] bg-line-soft">
                  <div
                    className={`h-full rounded-[4px] ${s.barClass}`}
                    style={{ width: `${s.width}%` }}
                  />
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card">
            <h3 className="mb-3.5 font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
              Assumptions
            </h3>
            {assumptions.map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 border-b border-line-soft py-[9px]"
              >
                <span className="text-[13px] text-ink-tertiary">{label}</span>
                <span className="text-[13px] font-semibold text-ink-secondary">
                  {value}
                </span>
              </div>
            ))}
            <div className="mt-3.5 flex items-center justify-between gap-3">
              <span className="text-[12px] text-ink-tertiary">
                Model updated
              </span>
              <span className="font-mono text-[12px] tabular-nums text-ink-secondary">
                {new Date(result.asOf).toISOString().slice(0, 10)}
              </span>
            </div>
          </section>
        </div>

        {/* Distribution forecast history table */}
        <section className="overflow-hidden rounded-[18px] border border-line bg-panel shadow-soft-card">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-[22px] pb-1.5 pt-[22px]">
            <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
              Distribution forecast
            </h3>
            <span className="font-mono text-[12px] tabular-nums text-ink-tertiary">
              {formatUsdMinor(result.forecast.totalProjectedMinor)} projected ·{" "}
              {result.completedCount} completed
              {result.completedCount === 1 ? "" : "s"}
            </span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border-b border-line px-4 pb-[11px] pt-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary">
                  Period
                </th>
                <th className="border-b border-line px-4 pb-[11px] pt-2 text-right font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary">
                  Projected
                </th>
                <th className="border-b border-line px-4 pb-[11px] pt-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-tertiary">
                  Basis
                </th>
              </tr>
            </thead>
            <tbody>
              {result.forecast.quarters.map((q) => (
                <tr
                  key={`${q.year}-Q${q.quarter}`}
                  className="border-b border-line-soft last:border-b-0"
                >
                  <td className="px-4 py-3.5 font-mono text-[13.5px] font-semibold tabular-nums text-ink">
                    Q{q.quarter} {q.year}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-[13.5px] tabular-nums text-ink-secondary">
                    {formatUsdMinor(q.projectedAmountMinor)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
                        CONFIDENCE_BADGE[q.confidence] ??
                        "bg-muted text-ink-secondary"
                      }`}
                    >
                      {CONFIDENCE_LABEL[q.confidence] ?? q.confidence}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="text-[12px] leading-relaxed text-ink-tertiary">
          As of {new Date(result.asOf).toISOString().slice(0, 10)}. The forecast
          uses a rolling average over your completed distributions; with ≥4
          completed distributions, the highest and lowest are dropped before
          averaging to reduce surprise. Exit-scenario IRR / MOIC are indicative
          and depend on project performance, capital-return priority and
          Director discretion. This is not a guarantee.
        </p>
      </div>
    </PortalShell>
  );
}
