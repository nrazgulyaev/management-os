import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getMyForecast } from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Forecasts · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

const CONFIDENCE_LABEL: Record<string, string> = {
  low_confidence:
    "Insufficient history (need ≥2 completed distributions)",
  rolling_average: "Rolling average over completed distributions",
  trimmed_average:
    "Trimmed average — highest + lowest dropped to reduce surprise",
};

export default async function PortalForecastsPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);
  const result = await getMyForecast({ horizonQuarters: 4 });

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle="Forecasts"
    >
      <div className="space-y-6">
        <Link
          href="/investor-portal/dashboard"
          className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back
        </Link>

        <div>
          <h1 className="font-display text-3xl text-ink">
            Distribution forecast
          </h1>
          <p className="text-sm text-ink-secondary mt-1">
            Projected cash distributions over the next{" "}
            {result.forecast.quarters.length} quarters, based on{" "}
            {result.completedCount} completed distribution
            {result.completedCount === 1 ? "" : "s"}.
          </p>
        </div>

        <div className="bg-muted border border-line-soft rounded-md p-5">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-ink-secondary" strokeWidth={1.75} />
            <span className="font-display text-xl text-ink">
              {formatUsdMinor(result.forecast.totalProjectedMinor)}
            </span>
          </div>
          <p className="text-xs text-ink-secondary">
            Total projected over the forecast horizon. Forecasts are
            indicative — actual distributions depend on project
            performance, capital-return priority, and Director discretion.
          </p>
        </div>

        <div className="border border-line-soft rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-ink-secondary">
              <tr>
                <th className="text-left px-3 py-2">Period</th>
                <th className="text-right px-3 py-2">Projected</th>
                <th className="text-left px-3 py-2">Basis</th>
              </tr>
            </thead>
            <tbody>
              {result.forecast.quarters.map((q, idx) => (
                <tr
                  key={`${q.year}-Q${q.quarter}`}
                  className={idx % 2 === 0 ? "bg-surface" : "bg-muted"}
                >
                  <td className="px-3 py-2 font-mono">
                    Q{q.quarter} {q.year}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUsdMinor(q.projectedAmountMinor)}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-secondary">
                    {CONFIDENCE_LABEL[q.confidence] ?? q.confidence}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-ink-tertiary leading-relaxed">
          As of {new Date(result.asOf).toISOString().slice(0, 10)}.
          The forecast uses a rolling average over your completed
          distributions; with ≥4 completed distributions, the highest
          and lowest are dropped before averaging to reduce surprise.
          This is not a guarantee.
        </p>
      </div>
    </PortalShell>
  );
}
