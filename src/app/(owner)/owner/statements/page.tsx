import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import {
  listMyStatements,
  getMyStatementDetail,
} from "@/features/owner-portal/owner-portal-queries";

/**
 * OWNER-PORTAL-1A — Statements list + detail. Reads from
 * owner_statements (STATEMENT-1 engine).
 *
 * `?id=<statementId>` selects which detail card renders. Defaults
 * to the most-recent statement.
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

function signedIdr(minor: bigint): string {
  const sign = minor >= 0n ? "+" : "−";
  const abs = minor < 0n ? -minor : minor;
  const v = Number(abs) / IDR_MILLION_MINOR;
  if (v >= 1) return `${sign}IDR ${v.toFixed(1)}M`;
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

interface Props {
  searchParams: Promise<{ id?: string }>;
}

export default async function OwnerStatementsPage({ searchParams }: Props) {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");
  const sp = await searchParams;
  const list = await listMyStatements(owner.ownerId, { limit: 24 });
  const selectedId = sp.id ?? list[0]?.statementId ?? null;
  const detail = selectedId
    ? await getMyStatementDetail(owner.ownerId, selectedId).catch(() => null)
    : null;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Portfolio", href: "/owner" },
          { label: "Statements" },
        ]}
        title="Statements"
        description={
          list.length === 0
            ? "No statements yet. Once your operator generates one, it will appear here."
            : `${list.length} statements across your villas. Click any row to view the full breakdown.`
        }
      />

      {/* Detail card */}
      {detail && (
        <Section
          eyebrow={`${detail.monthLabel} · ${detail.villaCode ?? "—"}`}
          title={`Net to you · ${fmtIdr(detail.netToOwnerIdrMinor)}`}
          variant="panel"
          action={
            <Button asChild size="sm">
              <Link
                href={`/api/finance/statements/${detail.statementId}/pdf`}
                target="_blank"
              >
                Statement PDF ↓
              </Link>
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b border-line-soft">
              <Cell label="Net (USD)" value={fmtUsd(detail.netToOwnerUsdMinor)} />
              <Cell label="Gross revenue" value={fmtIdr(detail.grossIdrMinor)} />
              <Cell label="Operator fee" value={`${detail.commissionPct.toFixed(0)}%`} />
              <Cell
                label="Status"
                value={detail.status.replace(/_/g, " ")}
              />
            </div>

            <Table>
              <THead>
                <TR>
                  <TH>Type</TH>
                  <TH>Description</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {detail.lines.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <Badge tone="outline">{l.lineType.replace(/_/g, " ")}</Badge>
                    </TD>
                    <TD className="text-sm">{l.description}</TD>
                    <TD
                      className="text-right font-mono tabular-nums"
                      style={{ color: l.amountIdrMinor >= 0n ? "var(--ok)" : "var(--ink-2)" }}
                    >
                      {signedIdr(l.amountIdrMinor)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            <p className="text-xs text-ink-tertiary">
              {detail.sentAt
                ? `Delivered ${new Date(detail.sentAt).toLocaleDateString("en-GB")} to ${detail.sentToEmail ?? "—"}. Hash-signed · auditable.`
                : detail.approvedAt
                  ? `Approved ${new Date(detail.approvedAt).toLocaleDateString("en-GB")}. Awaiting delivery.`
                  : "Draft — awaiting operator approval."}
              {detail.contentHash && (
                <>
                  {" · hash "}
                  <span className="font-mono">{detail.contentHash.slice(0, 16)}…</span>
                </>
              )}
            </p>
          </div>
        </Section>
      )}

      {/* List */}
      <Section
        eyebrow="All statements"
        title={`${list.length} ${list.length === 1 ? "statement" : "statements"}`}
      >
        {list.length === 0 ? (
          <p className="text-sm text-ink-tertiary italic">
            No statements yet. Your operator will generate them at the start of each month.
          </p>
        ) : (
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
                <TR key={s.statementId} className={s.statementId === selectedId ? "bg-muted/40" : ""}>
                  <TD className="font-medium">{s.monthLabel}</TD>
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
                      href={`/owner/statements?id=${s.statementId}`}
                      className="text-xs text-ink-secondary hover:text-terra"
                    >
                      View →
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

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="text-sm font-mono tabular-nums text-ink mt-1">{value}</div>
    </div>
  );
}
