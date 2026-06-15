import { redirect } from "next/navigation";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { PortalBadge } from "@/components/investor-portal/portal-primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getCurrentInvestorContext } from "@/features/investor-portal/investor-context";
import { getCapitalLedger } from "@/features/investor-portal/investor-portal-queries";

export const metadata = { title: "Capital ledger" };
export const dynamic = "force-dynamic";

function fmtUsd(minor: bigint): string {
  const v = Number(minor) / 100;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

const EVENT_TONE: Record<string, "success" | "info" | "gold"> = {
  commitment: "info",
  drawdown: "gold",
  distribution: "success",
};

export default async function CapitalLedgerPage() {
  const ctx = await getCurrentInvestorContext();
  if (!ctx) redirect("/dashboard/investors");
  const ledger = await getCapitalLedger(ctx.investorId, 100).catch(() => []);

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Investor portal · capital ledger"
        title="Capital ledger"
        subtitle={
          ledger.length === 0
            ? "No capital events recorded yet."
            : `${ledger.length} events across your commitments.`
        }
      />
      <section>
        <div className="label">All events</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Chronological
        </h2>
        {ledger.length === 0 ? (
          <Card style={{ padding: 24 }}>
            <p style={{ fontSize: 14, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>Empty ledger.</p>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Project</TH>
                <TH>Narrative</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {ledger.map((e) => (
                <TR key={`${e.eventType}-${e.id}`}>
                  <TD className="font-mono text-sm">{e.date}</TD>
                  <TD>
                    <PortalBadge tone={EVENT_TONE[e.eventType]}>{e.eventType}</PortalBadge>
                  </TD>
                  <TD className="text-sm">{e.projectName ?? "—"}</TD>
                  <TD className="text-sm text-ink-secondary">{e.narrative}</TD>
                  <TD
                    className="text-right font-mono tabular-nums"
                    style={{ color: e.eventType === "distribution" ? "var(--ok)" : "var(--ink)" }}
                  >
                    {fmtUsd(e.amountUsdMinor)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
