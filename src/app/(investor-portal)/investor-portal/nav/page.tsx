import { redirect } from "next/navigation";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getCurrentInvestorContext } from "@/features/investor-portal/investor-context";
import { getNavSeries } from "@/features/investor-portal/investor-portal-queries";

export const metadata = { title: "NAV history" };
export const dynamic = "force-dynamic";

function fmtUsd(minor: bigint): string {
  const v = Number(minor) / 100;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

export default async function NavPage() {
  const ctx = await getCurrentInvestorContext();
  if (!ctx) redirect("/dashboard/investors");
  const series = await getNavSeries(ctx.investorId).catch(() => []);
  const max = Math.max(0, ...series.map((p) => Number(p.totalNavUsdMinor)));

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Investor portal · NAV"
        title="NAV · your share"
        subtitle="Quarter-end snapshots of net asset value, weighted by your commitment in each project."
      />
      <Card style={{ padding: 20 }}>
        <div className="label">Trend</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Per quarter
        </h2>
        {series.length === 0 ? (
          <p className="text-sm text-ink-tertiary italic">No NAV snapshots yet.</p>
        ) : (
          <>
            <div className="flex items-end gap-2 h-40">
              {series.map((p, i) => {
                const h = max > 0 ? (Number(p.totalNavUsdMinor) / max) * 130 : 0;
                return (
                  <div key={p.quarterEndDate} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-[10px] font-mono text-ink-tertiary">{fmtUsd(p.totalNavUsdMinor)}</span>
                    <div className="w-full flex items-end h-full justify-center">
                      <div
                        style={{
                          width: "100%",
                          height: `${Math.max(h, 2)}px`,
                          background: i === series.length - 1 ? "var(--terra)" : "var(--forest)",
                          borderRadius: "3px 3px 0 0",
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-ink-tertiary">{p.quarterLabel}</span>
                  </div>
                );
              })}
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Quarter end</TH>
                  <TH>Period</TH>
                  <TH className="text-right">Your NAV share</TH>
                </TR>
              </THead>
              <TBody>
                {[...series].reverse().map((p) => (
                  <TR key={p.quarterEndDate}>
                    <TD className="font-mono text-sm">{p.quarterEndDate}</TD>
                    <TD>{p.quarterLabel}</TD>
                    <TD className="text-right font-mono tabular-nums text-ink">
                      {fmtUsd(p.totalNavUsdMinor)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        )}
      </Card>
    </div>
  );
}
