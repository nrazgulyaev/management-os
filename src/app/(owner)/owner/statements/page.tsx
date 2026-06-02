import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { listMyStatements } from "@/features/owner-portal/owner-portal-queries";

/**
 * OWNER-PORTAL — Statements list. Reads owner-scoped from owner_statements
 * (STATEMENT-1 engine). Each row links to the dedicated detail screen
 * `/owner/statements/[id]` (the mockup's two-screen IA: list → detail). The
 * legacy `?id=` inline-detail card was removed — the canonical detail now
 * lives on the [id] route.
 */
export const metadata = { title: "Statements" };
export const dynamic = "force-dynamic";

const IDR_BILLION_MINOR = 1_000_000_000_00;
const IDR_MILLION_MINOR = 1_000_000_00;
const IDR_K_MINOR = 1_000_00;

function fmtIdr(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  const sign = minor < 0n ? "−" : "";
  if (abs >= BigInt(IDR_BILLION_MINOR)) return `${sign}IDR ${(Number(abs) / IDR_BILLION_MINOR).toFixed(2)}B`;
  if (abs >= BigInt(IDR_MILLION_MINOR)) return `${sign}IDR ${(Number(abs) / IDR_MILLION_MINOR).toFixed(1)}M`;
  return `${sign}IDR ${Math.round(Number(abs) / IDR_K_MINOR)}K`;
}

function fmtUsd(minor: bigint): string {
  const usd = Number(minor) / 100;
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_TONE: Record<string, "success" | "gold" | "neutral" | "outline"> = {
  draft: "outline",
  pending_approval: "gold",
  approved: "gold",
  sent: "success",
  disputed: "neutral",
};

export default async function OwnerStatementsPage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");
  const list = await listMyStatements(owner.ownerId, { limit: 24 });

  return (
    <>
      <SectionHeading
        eyebrow="Portfolio · statements"
        title="Statements"
        subtitle={
          list.length === 0
            ? "No statements yet. Once your operator generates one, it will appear here."
            : `${list.length} statements across your villas. Open any row to view the full breakdown.`
        }
      />

      {list.length === 0 ? (
        <Card padding="default">
          <p className="text-sm text-ink-tertiary italic m-0">
            No statements yet. Your operator will generate them at the start of each month.
          </p>
        </Card>
      ) : (
        <Card padding="none" overflowHidden>
          <Table>
            <THead>
              <TR>
                <TH>Period</TH>
                <TH>Villa</TH>
                <TH className="text-right">Net (IDR)</TH>
                <TH className="text-right">≈ USD</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {list.map((s) => (
                <TR key={s.statementId}>
                  <TD>
                    <Link
                      href={`/owner/statements/${s.statementId}`}
                      className="font-medium text-ink hover:text-terra"
                    >
                      {s.monthLabel}
                    </Link>
                  </TD>
                  <TD className="font-mono text-sm">{s.villaCode ?? "—"}</TD>
                  <TD className="text-right font-mono tabular-nums text-terra">
                    {fmtIdr(s.netToOwnerIdrMinor)}
                  </TD>
                  <TD className="text-right font-mono tabular-nums text-ink-secondary text-sm">
                    {fmtUsd(s.netToOwnerUsdMinor)}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>
                      {s.status.replace(/_/g, " ")}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/owner/statements/${s.statementId}`}
                      className="text-xs text-ink-secondary hover:text-terra"
                    >
                      View →
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
