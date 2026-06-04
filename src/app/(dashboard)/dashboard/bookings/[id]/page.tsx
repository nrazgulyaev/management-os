import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { getBookingById } from "@/features/bookings/services";
import { RunAutomationButton } from "@/components/integrations/automation-actions";
import { listBookingAutomationRuns } from "@/features/booking-automation/services";
import { DetailPage, DetailMainAndSide } from "@/components/dashboard/detail/detail-page";
import { DetailHeader } from "@/components/dashboard/detail/detail-header";
import { DetailSide, type SideCard } from "@/components/dashboard/detail/detail-side";
import { DetailRelated, type RelatedItem } from "@/components/dashboard/detail/detail-related";
import { DetailActionBar } from "@/components/dashboard/detail/detail-actionbar";
import { BookingDetailTabs } from "./_detail-client";

/**
 * Phase 2.1 PR 2 — Booking detail uses bricks B1 + B2 + B3 + B4 + B5
 * + B8 (the kitchen sink). Existing content (automation runs, stay
 * details, money breakdown) is preserved as the "Overview" panel;
 * other tabs render placeholder empty-state copy until 2.2 cabinets
 * fill them in.
 */

export const metadata = { title: "Booking" };
export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const b = await getBookingById(id);
  if (!b) notFound();
  const automationRuns = await listBookingAutomationRuns({ bookingId: id });

  const pillCls = (() => {
    const k = (b.channelKey ?? "").toLowerCase();
    if (k.includes("airbnb")) return "airbnb";
    if (k.includes("booking")) return "bcom";
    if (k.includes("agoda")) return "agoda";
    if (k.includes("travel") || k === "ta") return "ta";
    return "direct";
  })();
  const channelPill = (
    <span className={`channel-pill ${pillCls}`}>
      <span className="dot" />
      {(b.channelName ?? "Direct").toUpperCase()}
    </span>
  );
  const netToOperator =
    b.netExpectedAmount ??
    b.grossAmount + b.cleaningFeeAmount - b.channelFeeAmount - b.paymentFeeAmount;
  const fmtAmt = (n: number) =>
    `${b.currency} ${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const chargesPanel = (
    <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
      <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
        <span className="text-label">Charges</span>
        <span className="font-mono text-[11px] text-ink-tertiary">4 lines</span>
      </div>
      <table className="w-full text-sm">
        <tbody className="[&_tr]:border-b [&_tr]:border-line-soft">
          <ChargeRow type="NIGHTLY" desc={`${b.nights} night${b.nights === 1 ? "" : "s"}`} display={`+${fmtAmt(b.grossAmount)}`} />
          <ChargeRow type="SERVICE" desc="Cleaning / turnover" display={`+${fmtAmt(b.cleaningFeeAmount)}`} />
          <ChargeRow type="FEE" desc="Channel commission" display={`−${fmtAmt(b.channelFeeAmount)}`} muted />
          <ChargeRow type="FEE" desc="Payment processing" display={`−${fmtAmt(b.paymentFeeAmount)}`} muted />
        </tbody>
      </table>
      <div className="px-5 py-3.5 border-t border-line-soft flex items-center justify-between bg-muted/20">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-tertiary">
          Net to operator after fees
        </span>
        <span className="font-mono tabular-nums text-terra font-semibold">{fmtAmt(netToOperator)}</span>
      </div>
    </div>
  );

  const sideCards: SideCard[] = [
    {
      id: "guest",
      eyebrow: "Primary guest",
      title: b.guestName,
      body: (
        <>
          {b.nights} night{b.nights === 1 ? "" : "s"} · {b.checkIn} → {b.checkOut}
        </>
      ),
    },
    {
      id: "channel",
      eyebrow: "Channel",
      title: b.channelName ?? "Direct",
      body: (
        <>
          Source <SourceBadge source={b.source} />
        </>
      ),
    },
    {
      id: "money",
      eyebrow: "Money snapshot",
      title: `${b.currency} ${b.grossAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      body: <>Gross before fees · {b.currency}</>,
    },
  ];

  const related: RelatedItem[] = [
    {
      id: "villa",
      href: `/dashboard/villas/${b.villaId}`,
      title: <>Villa {b.villaCode ?? "—"}</>,
      meta: "OPEN VILLA",
    },
  ];

  const overviewPanel = (
    <div className="flex flex-col gap-6 px-7 py-6">
      {automationRuns.length > 0 && (
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-line-soft">
            <span className="text-label">Automation runs</span>
          </div>
          <ul className="divide-y divide-line-soft text-sm">
            {automationRuns.map((r) => (
              <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-ink">{r.ruleName ?? "—"}</div>
                  {r.reason && (
                    <div className="text-[11px] text-ink-tertiary">{r.reason}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      r.runStatus === "created"
                        ? "success"
                        : r.runStatus === "skipped"
                          ? "neutral"
                          : "danger"
                    }
                  >
                    {r.runStatus}
                  </Badge>
                  {r.taskCode && (
                    <span className="font-mono text-[11px] text-ink-tertiary">
                      {r.taskCode}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Check-in" value={b.checkIn} mono />
        <Stat label="Check-out" value={b.checkOut} mono />
        <Stat label="Currency" value={b.currency} mono />
        <Stat label="Channel" value={b.channelName ?? "Direct"} />
      </div>

      {chargesPanel}

      <div className="rounded-md border border-line-soft bg-muted/30 p-5">
        <span className="text-label">Next steps</span>
        <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">
          Once revenue recognition (v3) is wired this booking will produce
          revenue, fee, and tax lines on its checkout date and feed the owner
          statement automatically.
        </p>
        <Link
          href={`/dashboard/villas/${b.villaId}`}
          className="text-xs underline text-ink mt-3 inline-block hover:text-accent"
        >
          Open villa →
        </Link>
      </div>
    </div>
  );

  const placeholderPanel = (label: string) => (
    <div className="flex flex-col gap-3 px-7 py-12 text-sm text-ink-tertiary">
      <p>{label} lands in Phase 2.2 — this tab is wired for visual proof-of-life only.</p>
    </div>
  );

  return (
    <DetailPage>
      {/* B1 — Header */}
      <DetailHeader
        breadcrumb={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: b.bookingCode },
        ]}
        title={
          <>
            {b.guestName || "Guest"}{" "}
            <span style={{ fontSize: 18, color: "var(--ink-3)" }}>
              · {b.villaCode ?? "—"}
            </span>
          </>
        }
        meta={
          <>
            <Badge tone={b.status === "cancelled" || b.status === "no_show" ? "neutral" : "success"}>
              {b.status.replace(/_/g, " ")}
            </Badge>
            <span>
              {b.checkIn} → {b.checkOut} · {b.nights}N
            </span>
            <span>·</span>
            {channelPill}
            <span>· {fmtAmt(b.grossAmount)} gross</span>
          </>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/bookings/${b.id}/guest-stay`}
              className="btn btn-secondary btn-sm"
            >
              Guest stay →
            </Link>
            <RunAutomationButton bookingId={b.id} />
          </div>
        }
      />

      <DetailMainAndSide>
        {/* B2 + B3 — tabs + main panel (client wrapper handles tab state) */}
        <BookingDetailTabs
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "charges", label: "Charges", count: 4 },
            { id: "guests", label: "Guests" },
            { id: "activity", label: "Activity", count: automationRuns.length },
            { id: "docs", label: "Documents" },
          ]}
          panels={{
            overview: overviewPanel,
            charges: <div className="px-7 py-6">{chargesPanel}</div>,
            guests: placeholderPanel("Guests list"),
            activity: placeholderPanel("Activity timeline"),
            docs: placeholderPanel("Document attachments"),
          }}
        />
        {/* B4 — Side rail */}
        <DetailSide cards={sideCards} />
      </DetailMainAndSide>

      {/* B5 — Related strip (single villa lookup) */}
      <DetailRelated eyebrow="Also see" items={related} />

      {/* B8 — Sticky save bar. Hidden until inline-edit wiring in 2.2
          flips the dirty state. */}
      <DetailActionBar dirty={false} dirtyCount={0} />
    </DetailPage>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <div className="text-label">{label}</div>
      <div className={`mt-1.5 text-sm text-ink ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function ChargeRow({
  type,
  desc,
  display,
  muted,
}: {
  type: string;
  desc: string;
  display: string;
  muted?: boolean;
}) {
  return (
    <tr>
      <td className="px-5 py-3 w-[88px]">
        <span className="inline-flex items-center rounded-md border border-line-soft bg-muted/40 px-2 py-0.5 font-mono text-[10px] tracking-wide text-ink-secondary uppercase">
          {type}
        </span>
      </td>
      <td className="px-2 py-3 text-ink-secondary">{desc}</td>
      <td
        className={`px-5 py-3 text-right font-mono tabular-nums ${muted ? "text-ink-tertiary" : "text-ink"}`}
      >
        {display}
      </td>
    </tr>
  );
}
