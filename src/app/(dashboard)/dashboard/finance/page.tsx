import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import {
  listOwnerStatementsLive,
  getOwnerStatementDetail,
  getFinanceKpis,
  getPayoutsQueue,
  getMaterialUsageBridgeNudge,
  type RealStatementDetail,
} from "@/features/finance/finance-cabinet-queries";
import {
  approveStatement,
  markStatementSent,
  generateAllForPeriod,
} from "@/features/finance/statement-actions";

/**
 * STATEMENT-1 — Mgmt OS Finance cabinet upgraded to the real engine.
 *
 * Reads from `owner_statements` + `statement_lines` (populated by
 * `seed-statements.ts` for demo; populated in production by the
 * monthly cron `/api/cron/statements-monthly`).
 *
 * - Status badges reflect real workflow: draft → approved → sent
 *   (+ disputed re-open path)
 * - PDF download: GET /api/finance/statements/[id]/pdf (direct stream)
 * - Approve / mark-sent: server-action buttons on each draft/approved row
 * - Generate-all: server-action button per period
 *
 * Email send is intentionally manual this sprint (EMAIL-1 follow-up):
 * operator downloads the PDF and sends from their own client, then
 * clicks "Mark sent" so the system records the audit trail.
 */

export const metadata = { title: "Finance · Owner statements" };
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
  return `USD ${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_TONE: Record<string, { tone?: "warn" | "ok" | "gold" | "danger"; label: string }> = {
  draft: { tone: "warn", label: "Draft" },
  pending_approval: { tone: "warn", label: "Pending" },
  approved: { tone: "ok", label: "Approved" },
  sent: { tone: "ok", label: "Sent" },
  disputed: { tone: "danger", label: "Disputed" },
  cancelled: { label: "Cancelled" },
  issued: { tone: "gold", label: "Issued" },
};

function StatementDetailCard({ detail }: { detail: RealStatementDetail }) {
  const status = STATUS_TONE[detail.status] ?? { label: detail.status };
  return (
    <Card padding="none" overflowHidden className="mb-[18px]">
      <div className="px-[22px] py-4 flex items-start border-b border-line-soft">
        <div>
          <div className="label">Statement</div>
          <h2 className="mt-1.5 mb-0 font-display text-[24px]">
            {detail.villaCode ?? "—"} · {detail.monthLabel}
          </h2>
          <div className="mono text-[11px] text-ink-4 mt-1">
            {detail.lines.length} lines · {detail.statementCode}
            {detail.contentHash ? ` · hash ${detail.contentHash.slice(0, 8)}…` : ""}
          </div>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <HandoffBadge tone={status.tone}>{status.label}</HandoffBadge>
          {detail.approvedAt && (
            <span className="mono text-[10px] text-ink-4">
              Approved {new Date(detail.approvedAt).toLocaleDateString("en-GB")}
            </span>
          )}
          {detail.sentAt && (
            <span className="mono text-[10px] text-ink-4">
              Sent {new Date(detail.sentAt).toLocaleDateString("en-GB")} → {detail.sentToEmail ?? "—"}
            </span>
          )}
        </div>
      </div>

      <table className="data">
        <thead>
          <tr>
            <th>Type</th>
            <th>Description</th>
            <th className="num">Amount (IDR)</th>
          </tr>
        </thead>
        <tbody>
          {detail.lines.map((l) => (
            <tr key={l.id}>
              <td>
                <HandoffBadge>{l.lineType.replace(/_/g, " ")}</HandoffBadge>
              </td>
              <td className="font-medium">{l.description}</td>
              <td
                className={
                  "num " +
                  (l.amountIdrMinor >= 0n ? "text-ok" : "text-ink-2")
                }
              >
                {signedIdr(l.amountIdrMinor)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink bg-cream-warm">
            <td colSpan={2} className="px-3.5 py-4 font-display text-[22px] font-normal">
              Net to owner · {detail.monthLabel}
            </td>
            <td className="num px-3.5 py-4 text-[24px] text-terra">
              {fmtIdr(detail.netToOwnerIdrMinor)}
              <div className="text-[11px] text-ink-3 mt-1">
                ≈ {fmtUsd(detail.netToOwnerUsdMinor)}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="px-[22px] py-3.5 border-t border-line-soft flex gap-2 bg-cream-warm flex-wrap">
        <Link
          href={`/api/finance/statements/${detail.id}/pdf`}
          className="btn btn-secondary btn-sm"
          target="_blank"
        >
          Download PDF ↓
        </Link>
        {detail.status === "draft" && (
          <form action={async () => {
            "use server";
            await approveStatement(detail.id);
          }}>
            <button className="btn btn-primary btn-sm" type="submit">Approve</button>
          </form>
        )}
        {detail.status === "approved" && (
          <form action={async (data: FormData) => {
            "use server";
            const email = (data.get("email") as string) ?? "";
            await markStatementSent(detail.id, email || "owner@example.com");
          }}>
            <input
              name="email"
              type="email"
              placeholder="owner@example.com"
              defaultValue={detail.sentToEmail ?? ""}
              className="px-2 py-1 text-[12px] border border-line rounded-md mr-1.5"
            />
            <button className="btn btn-primary btn-sm" type="submit">Mark sent</button>
          </form>
        )}
        <span className="mono ml-auto text-[11px] text-ink-3">
          {detail.commissionPct}% operator fee · FX 15,800 IDR/USD
        </span>
      </div>
    </Card>
  );
}

interface FinancePageProps {
  searchParams: Promise<{ id?: string; period?: string }>;
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const sp = await searchParams;
  const allStatements = await listOwnerStatementsLive({ limit: 20 }).catch(() => []);
  const selectedId = sp.id ?? allStatements[0]?.id ?? null;
  const [detail, kpis, payouts, bridge] = await Promise.all([
    selectedId ? getOwnerStatementDetail(selectedId).catch(() => null) : Promise.resolve(null),
    getFinanceKpis().catch(() => null),
    getPayoutsQueue().catch(() => []),
    getMaterialUsageBridgeNudge().catch(() => null),
  ]);

  // Period dropdown — unique period_month values from the list
  const uniquePeriods = Array.from(
    new Set(allStatements.map((s) => s.periodMonth).filter(Boolean)),
  ).slice(0, 6);

  const draftCount = allStatements.filter((s) => s.status === "draft").length;
  const approvedCount = allStatements.filter((s) => s.status === "approved").length;
  const sentCount = allStatements.filter((s) => s.status === "sent").length;

  async function generateForPeriodAction(formData: FormData) {
    "use server";
    const period = (formData.get("period") as string) ?? null;
    if (!period) return;
    await generateAllForPeriod(period);
    redirect(`/dashboard/finance?period=${period}`);
  }

  return (
    <>
      <SectionHeading
        eyebrow={
          allStatements.length === 0
            ? "Finance · no statements yet"
            : `Finance · ${allStatements.length} statements (${draftCount} draft · ${approvedCount} approved · ${sentCount} sent)`
        }
        title={
          detail ? (
            <>
              {detail.ownerName} ·{" "}
              <em>{detail.villaCode ?? "—"}</em> · {detail.monthLabel}
            </>
          ) : (
            <>Owner statements.</>
          )
        }
        subtitle={
          detail
            ? `Real statement generated by the engine. Approve to allow sending; mark sent after delivering PDF.`
            : "Generate statements for any month with bookings, then approve and send via PDF download. Automated monthly delivery available when email integration is configured."
        }
        actions={
          <form action={generateForPeriodAction} className="flex gap-2">
            <select
              name="period"
              defaultValue={sp.period ?? uniquePeriods[0] ?? ""}
              className="px-2.5 py-1.5 text-[12px] border border-line rounded-md bg-paper"
            >
              {(uniquePeriods.length === 0
                ? [new Date().toISOString().slice(0, 8) + "01"]
                : uniquePeriods
              ).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" type="submit">
              Generate all
            </button>
          </form>
        }
      />

      <div className="grid grid-cols-5 gap-3 mb-[18px]">
        <Kpi
          label="Statements · total"
          value={allStatements.length === 0 ? "—" : String(allStatements.length)}
          sub={`${draftCount} draft · ${approvedCount} approved · ${sentCount} sent`}
        />
        <Kpi
          label="Draft · this period"
          value={draftCount === 0 ? "—" : String(draftCount)}
          sub="awaiting approval"
          tone={draftCount > 0 ? "gold" : undefined}
        />
        <Kpi
          label="Approved · awaiting send"
          value={approvedCount === 0 ? "—" : String(approvedCount)}
          sub="download PDF + mark sent"
          tone={approvedCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Sent · 30d"
          value={sentCount === 0 ? "—" : String(sentCount)}
          sub="delivered to owners"
          tone={sentCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Pending generation"
          value={kpis && kpis.statementsPendingCount > 0 ? String(kpis.statementsPendingCount) : "—"}
          sub="owner × villa × month with bookings"
        />
      </div>

      {/* Statement detail */}
      {detail ? (
        <StatementDetailCard detail={detail} />
      ) : (
        <Card className="p-5 mb-[18px]">
          <p className="text-[13px] text-ink-3 italic m-0">
            No statement selected. Generate statements for a period above to populate this view.
          </p>
        </Card>
      )}

      {/* All statements list */}
      <h2 className="display text-[30px] mt-8 mb-3.5 font-normal">
        All statements
      </h2>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {allStatements.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No statements yet. Use the &quot;Generate all&quot; button above to materialise statements
            for any month with bookings.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Owner</th>
                <th>Villa</th>
                <th>Period</th>
                <th className="num">Net (IDR)</th>
                <th className="num">≈ USD</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allStatements.map((s) => {
                const status = STATUS_TONE[s.status] ?? { label: s.status };
                return (
                  <tr
                    key={s.id}
                    className={s.id === selectedId ? "bg-cream-warm" : ""}
                  >
                    <td>{s.ownerName}</td>
                    <td className="mono text-[12px]">{s.villaCode ?? "—"}</td>
                    <td className="serif text-[14px]">{s.monthLabel}</td>
                    <td className="num text-terra font-medium">
                      {fmtIdr(s.netToOwnerIdrMinor)}
                    </td>
                    <td className="num text-ink-3 text-[12px]">
                      {fmtUsd(s.netToOwnerUsdMinor)}
                    </td>
                    <td>
                      <HandoffBadge tone={status.tone}>{status.label}</HandoffBadge>
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/finance?id=${s.id}`}
                        className="btn btn-ghost btn-sm"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Payouts queue */}
      <h2
        id="payments"
        className="display text-[30px] mt-8 mb-3.5 font-normal"
      >
        Payouts <em>queued</em>
      </h2>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {payouts.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No payouts queued. Payouts generate from approved statements; payment-rails
            integration coming soon.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Recipient</th>
                <th className="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{p.ownerName}</td>
                  <td className="num">{fmtIdr(p.amountIdrMinor)}</td>
                  <td>
                    <HandoffBadge tone={p.status === "settled" ? "ok" : "gold"}>{p.status}</HandoffBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {bridge ? (
        <Card
          id="bridge"
          className="p-5 bg-cream-warm border border-dashed border-terra"
        >
          <div className="label text-terra">
            Material usage bridge · {bridge.consumedBookingsCount} entries
          </div>
        </Card>
      ) : null}
    </>
  );
}
