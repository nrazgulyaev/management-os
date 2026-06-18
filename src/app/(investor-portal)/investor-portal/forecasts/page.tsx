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

  // --- Realised figures (canonical XIRR engine) ------------------------
  // Net IRR / MOIC are the LP's REAL computed figures. No fabricated
  // fallbacks: when the LP has no contribution history yet, these are
  // null/0 and the surface renders an honest empty-state instead of
  // inventing return numbers.
  const netIrr = hasAnalytics ? analytics!.netIrr : null;
  const netIrrPct = netIrr !== null ? netIrr * 100 : null;
  const moicNow = hasAnalytics ? analytics!.moic : 0;
  const dpiNow = hasAnalytics ? analytics!.dpi : 0;
  const targetIrr = analytics?.targetIrr ?? 0.08;

  // --- XIRR curve ------------------------------------------------------
  // We plot ONLY real points. The analytics engine computes a single
  // point-in-time Net IRR (not a quarterly history), so the realised
  // series is that one anchor point. No invented ramp, no fabricated
  // exit-IRR projection — when there is no IRR yet the chart shows its
  // built-in "not enough history" empty state.
  const actualCurve: XirrCurvePoint[] =
    netIrrPct !== null
      ? [{ label: "Net IRR now", valuePct: Number(netIrrPct.toFixed(1)) }]
      : [];

  // --- Illustrative sensitivity bands ----------------------------------
  // There is no operator-authored exit-scenario engine for the LP yet.
  // Rather than present invented IRR/MOIC as fund scenarios, we derive a
  // clearly-labelled ±illustrative sensitivity around the LP's REAL
  // current Net IRR / MOIC. Bar widths are proportional to each band's
  // IRR relative to the upside (not arbitrary). Shown only when real
  // analytics exist.
  const SENSITIVITY = 0.25; // ±25% illustrative band around realised IRR
  const scenarios =
    hasAnalytics && netIrrPct !== null
      ? (() => {
          const up = netIrrPct * (1 + SENSITIVITY);
          const base = netIrrPct;
          const down = Math.max(netIrrPct * (1 - SENSITIVITY), 0);
          const maxIrr = Math.max(up, 1);
          return [
            {
              name: "Upside",
              irr: pct(up / 100),
              moic: multiple(moicNow * (1 + SENSITIVITY)),
              barClass: "bg-ok",
              width: Math.round((up / maxIrr) * 100),
            },
            {
              name: "Base (realised)",
              irr: pct(base / 100),
              moic: multiple(moicNow),
              barClass: "bg-amber",
              width: Math.round((base / maxIrr) * 100),
            },
            {
              name: "Downside",
              irr: pct(down / 100),
              moic: multiple(Math.max(moicNow * (1 - SENSITIVITY), 1)),
              barClass: "bg-warning",
              width: Math.round((down / maxIrr) * 100),
            },
          ];
        })()
      : [];

  // --- Forecast basis ---------------------------------------------------
  // Real, LP-specific inputs the forecast actually rests on — replaces
  // the previously hardcoded sales-pace / price / cost assumptions that
  // were never sourced from this LP's data.
  const basis: Array<[string, string]> = hasAnalytics
    ? [
        ["Contributed", formatUsdMinor(analytics!.contributedMinor)],
        ["Distributed", formatUsdMinor(analytics!.distributedMinor)],
        ["Residual NAV", formatUsdMinor(analytics!.residualNavMinor)],
        ["Target hurdle", pct(targetIrr)],
        [
          "Completed distributions",
          String(result.completedCount),
        ],
      ]
    : [];

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

        {/* Page header — eyebrow + display title */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="label">Forecasts</div>
            <h1 className="display mt-1.5 text-[26px] font-medium tracking-[-0.02em] text-ink sm:text-[29px]">
              Return forecast
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-tertiary">
              Your realised Net IRR / MOIC and a rolling-average
              distribution forecast over the next{" "}
              {result.forecast.quarters.length} quarters
            </p>
          </div>
        </div>

        {/* KPI row — realised Net IRR · MOIC · DPI (all from the canonical
            XIRR engine; honest "—" when there is no contribution history). */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PortalKpi
            label="Net IRR"
            value={netIrrPct !== null ? pct(netIrr) : "—"}
            hint="realised, to date"
          />
          <PortalKpi
            label="MOIC"
            value={hasAnalytics ? multiple(moicNow) : "—"}
            hint="total value ÷ paid-in"
            tone="amber"
          />
          <PortalKpi
            label="DPI"
            value={hasAnalytics ? multiple(dpiNow) : "—"}
            hint="distributed ÷ paid-in"
          />
        </div>

        {/* XIRR curve card — plots the LP's REAL current Net IRR. No
            fabricated ramp or projection line. */}
        <section className="rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
              Realised Net IRR
            </h3>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-tertiary">
              <span className="inline-block h-[3px] w-4 rounded-full bg-amber" />
              Realised
            </span>
          </div>
          <XirrCurveChart actual={actualCurve} tall />
        </section>

        {/* Illustrative sensitivity + real forecast basis */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <section className="rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card">
            <div className="mb-3.5 flex items-baseline justify-between gap-3">
              <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
                Illustrative sensitivity
              </h3>
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-tertiary">
                Illustrative
              </span>
            </div>
            {scenarios.length === 0 ? (
              <p className="py-2 text-[13px] text-ink-tertiary">
                A sensitivity band appears once you have realised return
                figures — typically after your first completed
                distribution.
              </p>
            ) : (
              <>
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
                <p className="mt-3 text-[11.5px] leading-relaxed text-ink-tertiary">
                  Upside / downside are a ±25% illustrative band around
                  your realised Net IRR / MOIC — not an operator forecast
                  or a guarantee.
                </p>
              </>
            )}
          </section>

          <section className="rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card">
            <h3 className="mb-3.5 font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
              Forecast basis
            </h3>
            {basis.length === 0 ? (
              <p className="py-2 text-[13px] text-ink-tertiary">
                Your forecast basis appears once your first capital call is
                received.
              </p>
            ) : (
              basis.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 border-b border-line-soft py-[9px] last:border-b-0"
                >
                  <span className="text-[13px] text-ink-tertiary">
                    {label}
                  </span>
                  <span className="font-mono text-[13px] tabular-nums font-semibold text-ink-secondary">
                    {value}
                  </span>
                </div>
              ))
            )}
            <div className="mt-3.5 flex items-center justify-between gap-3">
              <span className="text-[12px] text-ink-tertiary">
                As of
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
          As of {new Date(result.asOf).toISOString().slice(0, 10)}. Net IRR,
          MOIC and DPI are computed from your actual dated cashflows. The
          distribution forecast uses a rolling average over your completed
          distributions; with ≥4 completed distributions, the highest and
          lowest are dropped before averaging to reduce surprise. The
          illustrative sensitivity band is a ±25% range around your realised
          figures, not an operator projection — it depends on project
          performance, capital-return priority and Director discretion, and is
          not a guarantee.
        </p>
      </div>
    </PortalShell>
  );
}
