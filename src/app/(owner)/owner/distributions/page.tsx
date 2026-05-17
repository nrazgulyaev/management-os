import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { listMyDistributions } from "@/features/owner-portal/owner-portal-queries";

/**
 * OWNER-PORTAL-1A — Distributions page.
 * Filters to statements with status='sent' (= delivered, payable
 * distributions). Real payout-rail status lands with PAYOUT-1.
 */

export const metadata = { title: "Distributions" };
export const dynamic = "force-dynamic";

const IDR_BILLION_MINOR = 1_000_000_000_00;
const IDR_MILLION_MINOR = 1_000_000_00;
const IDR_K_MINOR = 1_000_00;

function fmtIdr(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  if (abs >= BigInt(IDR_BILLION_MINOR)) return `IDR ${(Number(abs) / IDR_BILLION_MINOR).toFixed(2)}B`;
  if (abs >= BigInt(IDR_MILLION_MINOR)) return `IDR ${(Number(abs) / IDR_MILLION_MINOR).toFixed(1)}M`;
  return `IDR ${Math.round(Number(abs) / IDR_K_MINOR)}K`;
}

function fmtUsd(minor: bigint): string {
  const usd = Number(minor) / 100;
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function OwnerDistributionsPage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");
  const data = await listMyDistributions(owner.ownerId);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Portfolio", href: "/owner" },
          { label: "Distributions" },
        ]}
        title="Distributions"
        description={
          data.statementsCount === 0
            ? "No distributions yet. Distributions appear once your operator marks a statement as sent."
            : `YTD ${fmtUsd(data.ytdDistributedUsdMinor)} · ${data.statementsCount} ${data.statementsCount === 1 ? "statement" : "statements"} delivered.`
        }
      />

      <Section eyebrow="Sent statements" title={`${data.rows.length} delivered`}>
        {data.rows.length === 0 ? (
          <p className="text-sm text-ink-tertiary italic">
            Once your operator approves and sends a statement, it shows here as a
            distribution. Bank-rail payouts ship with the PAYOUT-1 sprint.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Period</TH>
                <TH>Villa</TH>
                <TH className="text-right">Net (IDR)</TH>
                <TH className="text-right">≈ USD</TH>
                <TH>Wired</TH>
                <TH>Recipient</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {data.rows.map((s) => (
                <TR key={s.statementId}>
                  <TD className="font-medium">{s.monthLabel}</TD>
                  <TD className="font-mono text-sm">{s.villaCode ?? "—"}</TD>
                  <TD className="text-right font-mono tabular-nums text-terra">
                    {fmtIdr(s.netToOwnerIdrMinor)}
                  </TD>
                  <TD className="text-right font-mono tabular-nums text-ink-secondary text-sm">
                    {fmtUsd(s.netToOwnerUsdMinor)}
                  </TD>
                  <TD className="font-mono text-xs text-ink-tertiary">
                    {s.sentAt ? new Date(s.sentAt).toLocaleDateString("en-GB") : "—"}
                  </TD>
                  <TD className="text-xs text-ink-secondary">
                    {s.sentToEmail ?? "—"}
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/api/finance/statements/${s.statementId}/pdf`}
                      target="_blank"
                      className="text-xs text-ink-secondary hover:text-terra"
                    >
                      PDF →
                    </Link>
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
