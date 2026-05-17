import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
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
      <PageHeader
        breadcrumbs={[
          { label: "Investor portal", href: "/investor-portal" },
          { label: "Capital ledger" },
        ]}
        title="Capital ledger"
        description={
          ledger.length === 0
            ? "No capital events recorded yet."
            : `${ledger.length} events across your commitments.`
        }
      />
      <Section eyebrow="All events" title="Chronological">
        {ledger.length === 0 ? (
          <p className="text-sm text-ink-tertiary italic">Empty ledger.</p>
        ) : (
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
                    <Badge tone={EVENT_TONE[e.eventType]}>{e.eventType}</Badge>
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
        )}
      </Section>
    </div>
  );
}
