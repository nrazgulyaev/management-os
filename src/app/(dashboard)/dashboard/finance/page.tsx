import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
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
    <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
      <div
        style={{
          padding: "16px 22px",
          display: "flex",
          alignItems: "flex-start",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <div>
          <div className="label">Statement</div>
          <h2 style={{ margin: "6px 0 0", fontFamily: "var(--font-newsreader), serif", fontSize: 24 }}>
            {detail.villaCode ?? "—"} · {detail.monthLabel}
          </h2>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
            {detail.lines.length} lines · {detail.statementCode}
            {detail.contentHash ? ` · hash ${detail.contentHash.slice(0, 8)}…` : ""}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <Badge tone={status.tone}>{status.label}</Badge>
          {detail.approvedAt && (
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
              Approved {new Date(detail.approvedAt).toLocaleDateString("en-GB")}
            </span>
          )}
          {detail.sentAt && (
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
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
                <Badge>{l.lineType.replace(/_/g, " ")}</Badge>
              </td>
              <td style={{ fontWeight: 500 }}>{l.description}</td>
              <td
                className="num"
                style={{ color: l.amountIdrMinor >= 0n ? "var(--ok)" : "var(--ink-2)" }}
              >
                {signedIdr(l.amountIdrMinor)}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: "2px solid var(--ink)", background: "var(--cream-warm)" }}>
            <td colSpan={2} style={{ padding: "16px 14px", fontFamily: "var(--font-newsreader), serif", fontSize: 22, fontWeight: 400 }}>
              Net to owner · {detail.monthLabel}
            </td>
            <td className="num" style={{ padding: "16px 14px", fontSize: 24, color: "var(--terra)" }}>
              {fmtIdr(detail.netToOwnerIdrMinor)}
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                ≈ {fmtUsd(detail.netToOwnerUsdMinor)}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          padding: "14px 22px",
          borderTop: "1px solid var(--line-soft)",
          display: "flex",
          gap: 8,
          background: "var(--cream-warm)",
          flexWrap: "wrap",
        }}
      >
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
              style={{
                padding: "4px 8px",
                fontSize: 12,
                border: "1px solid var(--line)",
                borderRadius: 6,
                marginRight: 6,
              }}
            />
            <button className="btn btn-primary btn-sm" type="submit">Mark sent</button>
          </form>
        )}
        <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>
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
              <em style={{ color: "var(--terra)", fontStyle: "italic" }}>
                {detail.villaCode ?? "—"}
              </em>{" "}
              · {detail.monthLabel}
            </>
          ) : (
            <>Owner statements.</>
          )
        }
        subtitle={
          detail
            ? `Real statement generated by the engine. Approve to allow sending; mark sent after delivering PDF.`
            : "Generate statements for any month with bookings, then approve + send via PDF download. Auto-send via the monthly cron will land with EMAIL-1."
        }
        actions={
          <form action={generateForPeriodAction} style={{ display: "flex", gap: 8 }}>
            <select
              name="period"
              defaultValue={sp.period ?? uniquePeriods[0] ?? ""}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                border: "1px solid var(--line)",
                borderRadius: 6,
                background: "var(--paper)",
              }}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
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
        <Card style={{ padding: 20, marginBottom: 18 }}>
          <p style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No statement selected. Generate statements for a period above to populate this view.
          </p>
        </Card>
      )}

      {/* All statements list */}
      <h2
        className="display"
        style={{ fontSize: 30, marginTop: 32, marginBottom: 14, fontWeight: 400 }}
      >
        All statements
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        {allStatements.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
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
                  <tr key={s.id} style={{ background: s.id === selectedId ? "var(--cream-warm)" : "transparent" }}>
                    <td>{s.ownerName}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{s.villaCode ?? "—"}</td>
                    <td style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 14 }}>
                      {s.monthLabel}
                    </td>
                    <td className="num" style={{ color: "var(--terra)", fontWeight: 500 }}>
                      {fmtIdr(s.netToOwnerIdrMinor)}
                    </td>
                    <td className="num" style={{ color: "var(--ink-3)", fontSize: 12 }}>
                      {fmtUsd(s.netToOwnerUsdMinor)}
                    </td>
                    <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
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
        className="display"
        style={{ fontSize: 30, marginTop: 32, marginBottom: 14, fontWeight: 400 }}
      >
        Payouts{" "}
        <em style={{ color: "var(--terra)", fontStyle: "italic" }}>queued</em>
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        {payouts.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No payouts queued. Payouts generate from approved statements; payment-rails
            integration lands in the PAYOUT-1 sprint.
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
                    <Badge tone={p.status === "settled" ? "ok" : "gold"}>{p.status}</Badge>
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
          style={{
            padding: 20,
            background: "var(--cream-warm)",
            border: "1px dashed var(--terra)",
          }}
        >
          <div className="label" style={{ color: "var(--terra)" }}>
            Material usage bridge · {bridge.consumedBookingsCount} entries
          </div>
        </Card>
      ) : null}
    </>
  );
}
