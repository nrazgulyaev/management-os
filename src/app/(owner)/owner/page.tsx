import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import {
  getOwnerDashboardKpis,
  getTwelveMonthNetSeries,
  listMyStatements,
  listMyVillas,
} from "@/features/owner-portal/owner-portal-queries";

/**
 * Sprint OWNER-PORTAL-1A — Owner home (dashboard).
 *
 * Real data flow:
 *   - latest statement   → owner_statements LIMIT 1 by period
 *   - 4-up KPIs          → net-to-you + 30-day occupancy + ADR + channel mix
 *   - 12-month chart     → owner_statements bucketed monthly
 *   - my villas          → ownership_shares × villas, MTD aggregates
 *
 * Owner stays quota + documents = empty state (DEMO-3 dependency).
 */

export const metadata = { title: "Your portfolio" };
export const dynamic = "force-dynamic";

function fmtUsd(usdMinor: bigint): string {
  const usd = Number(usdMinor) / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

const VILLA_GRADIENTS = [
  "linear-gradient(135deg, #c4a572 0%, #6b5436 100%)",
  "linear-gradient(135deg, #5a6e7a 0%, #2c3848 100%)",
  "linear-gradient(135deg, #8c6f4f 0%, #3a2c1d 100%)",
  "linear-gradient(135deg, #6b7d62 0%, #2f3a26 100%)",
];

export default async function OwnerHomePage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const [kpis, villas, monthly, latestStatements] = await Promise.all([
    getOwnerDashboardKpis(owner.ownerId).catch(() => null),
    listMyVillas(owner.ownerId).catch(() => []),
    getTwelveMonthNetSeries(owner.ownerId).catch(() => []),
    listMyStatements(owner.ownerId, { limit: 1 }).catch(() => []),
  ]);
  const latest = latestStatements[0] ?? null;

  // Light templated AI-narrative based on real data — no LLM call.
  const monthlyAvg = monthly.length > 0
    ? monthly.reduce((s, m) => s + Number(m.netUsdMinor), 0) / monthly.length
    : 0;
  const latestUsd = latest ? Number(latest.netToOwnerUsdMinor) : 0;
  const aiInsight = latest
    ? latestUsd > monthlyAvg
      ? `${latest.monthLabel} closed above your 12-month average — a strong period for ${latest.villaCode ?? "your villa"}.`
      : `${latest.monthLabel} closed below your 12-month average. Review the line items below to see what moved.`
    : "Once your first statement is generated, a summary lands here.";

  const monthlyMaxMinor = Math.max(0, ...monthly.map((m) => Number(m.netUsdMinor)));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow={
          latest
            ? `${latest.monthLabel} · statement ${latest.status === "sent" ? "delivered" : latest.status}`
            : new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())
        }
        title={`Good morning, ${owner.ownerName.split(" ")[0]}.`}
        description={aiInsight}
        actions={
          latest ? (
            <Button asChild>
              <Link href={`/api/finance/statements/${latest.statementId}/pdf`} target="_blank">
                Download {latest.monthLabel} statement
                <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="ghost">
              <Link href="/owner/statements">View statements</Link>
            </Button>
          )
        }
      />

      {/* 4-up KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          label="Net to you"
          value={kpis && kpis.netToYouLatestUsdMinor > 0n ? fmtUsd(kpis.netToYouLatestUsdMinor) : "—"}
          sub={kpis?.latestPeriodLabel ?? "no statements yet"}
        />
        <KpiTile
          label="Occupancy · 30-day"
          value={kpis && kpis.occupancy30DayPct > 0 ? `${kpis.occupancy30DayPct}%` : "—"}
          sub="across your villas"
        />
        <KpiTile
          label="ADR"
          value={kpis && kpis.adrUsdMinor > 0n ? fmtUsd(kpis.adrUsdMinor) : "—"}
          sub="per night · 30d"
        />
        <KpiTile
          label="Direct vs OTA"
          value={
            kpis && (kpis.directPct > 0 || kpis.otaPct > 0)
              ? `${kpis.directPct}% / ${kpis.otaPct}%`
              : "—"
          }
          sub="channel mix · 30d"
        />
      </div>

      {/* Statement detail + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
        <Section
          eyebrow={latest ? `Statement · ${latest.monthLabel}` : "Statements"}
          title={latest ? `${latest.villaCode ?? "—"} · ${latest.monthLabel}` : "No statements yet"}
          variant="panel"
          action={
            latest && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/owner/statements">All statements →</Link>
              </Button>
            )
          }
        >
          {latest ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-4 border-b border-line-soft">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                    Net to you
                  </div>
                  <div className="text-display text-[22px] leading-tight font-medium text-terra mt-1 font-mono tabular-nums">
                    {fmtUsd(latest.netToOwnerUsdMinor)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                    Status
                  </div>
                  <div className="text-sm font-medium text-ink mt-1 capitalize">
                    {latest.status.replace(/_/g, " ")}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                    Hash
                  </div>
                  <div className="text-xs font-mono text-ink-tertiary mt-1">
                    {latest.contentHash?.slice(0, 12) ?? "—"}…
                  </div>
                </div>
              </div>
              <p className="text-sm text-ink-secondary">
                {latest.sentAt
                  ? `Delivered ${new Date(latest.sentAt).toLocaleDateString("en-GB")} to ${latest.sentToEmail ?? "—"}. Hash-signed · auditable.`
                  : latest.approvedAt
                    ? `Approved ${new Date(latest.approvedAt).toLocaleDateString("en-GB")}. Awaiting delivery.`
                    : "Draft — awaiting operator approval."}
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button asChild size="sm">
                  <Link href={`/api/finance/statements/${latest.statementId}/pdf`} target="_blank">
                    Statement PDF ↓
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/owner/distributions">Distributions →</Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-tertiary italic">
              Once your first statement is generated by your operator, it will appear here
              with the net-to-you amount, the line breakdown, and a download link.
            </p>
          )}
        </Section>

        <div className="flex flex-col gap-4">
          {/* 12-month chart */}
          <div className="rounded-md border border-line-soft bg-surface p-5">
            <div className="text-[10px] uppercase tracking-widest text-ink-tertiary mb-3">
              Last 12 months · net to you
            </div>
            {monthly.every((m) => m.netUsdMinor === 0n) ? (
              <p className="text-xs text-ink-tertiary italic">
                Chart populates as monthly statements land.
              </p>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {monthly.map((m, i) => {
                  const v = Number(m.netUsdMinor);
                  const h = monthlyMaxMinor > 0 ? (v / monthlyMaxMinor) * 110 : 0;
                  return (
                    <div key={m.monthIso} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className="w-full flex items-end h-full justify-center">
                        <div
                          style={{
                            width: "100%",
                            height: `${Math.max(h, 2)}px`,
                            background:
                              i === monthly.length - 1 ? "var(--terra)" : "var(--forest)",
                            borderRadius: "2px 2px 0 0",
                          }}
                        />
                      </div>
                      <span className="text-[9px] text-ink-tertiary font-mono">
                        {m.monthLabel.split(" ")[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Owner stays quota — empty state, DEMO-3 dependency */}
          <div className="rounded-md border border-dashed border-line-strong bg-canvas p-5">
            <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
              Owner stays · quota
            </div>
            <p className="text-sm text-ink-tertiary italic mt-2">
              Quota tracking ships in DEMO-3. Block your villa for personal use via
              the bookings flow until then.
            </p>
          </div>
        </div>
      </div>

      {/* My villas */}
      <Section
        eyebrow="Owned villas"
        title="Your villas"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/owner/villas">All villas</Link>
          </Button>
        }
      >
        {villas.length === 0 ? (
          <p className="text-sm text-ink-tertiary italic">
            No villa ownership recorded. Contact your operator to confirm shares.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {villas.slice(0, 4).map((v, i) => (
              <div
                key={v.villaId}
                className="group rounded-lg border border-line-soft bg-surface overflow-hidden flex flex-col"
              >
                <div
                  style={{
                    background: VILLA_GRADIENTS[i % VILLA_GRADIENTS.length],
                    height: 80,
                  }}
                />
                <div className="p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-ink-tertiary">
                      {v.villaCode}
                    </span>
                    <span className="text-[10px] text-ink-tertiary tabular-nums">
                      {v.sharePercent}% share
                    </span>
                  </div>
                  <div>
                    <h3 className="text-display text-[18px] leading-tight font-medium text-ink">
                      {v.villaName ?? v.villaCode ?? "Villa"}
                    </h3>
                    <p className="text-xs text-ink-tertiary mt-0.5">{v.projectName ?? "—"}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-line-soft text-xs">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                        MTD net
                      </div>
                      <div className="font-mono tabular-nums text-ink mt-0.5">
                        {v.mtdNetUsdMinor > 0n ? fmtUsd(v.mtdNetUsdMinor) : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                        Occupancy
                      </div>
                      <div className="font-mono tabular-nums text-ink mt-0.5">
                        {v.occupancyPct > 0 ? `${v.occupancyPct}%` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                        ADR
                      </div>
                      <div className="font-mono tabular-nums text-ink mt-0.5">
                        {v.adrUsdMinor > 0n ? fmtUsd(v.adrUsdMinor) : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="text-display text-[22px] leading-tight font-medium text-ink mt-2 font-mono tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-ink-tertiary mt-1">{sub}</div>
    </div>
  );
}
