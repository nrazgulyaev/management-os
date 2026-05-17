import Link from "next/link";
import { SectionHeading, Card, Kpi } from "@/components/dashboard/primitives";
import { NoItemsYet } from "@/components/ui/primitives";
import {
  getOwnerRevenueMetrics,
  listOwnerRevenueSourceMonthly,
} from "@/features/owner-bookings/services";
import { listOwnerIdsForCurrentUser } from "@/features/notifications/services";
import {
  summarizeOwnerRevenueSourceMix,
  totalNetOwnerEffectMinor,
  type RevenueSourceMonthlyRow,
} from "@/features/owner-bookings/revenue-pure";
import { formatMoneyMinor, calculateAdrMinor } from "@/lib/money";

export const metadata = { title: "Revenue transparency" };
export const dynamic = "force-dynamic";

export default async function OwnerRevenuePage() {
  const ownerIds = await listOwnerIdsForCurrentUser();
  if (ownerIds.length === 0) {
    return (
      <SectionHeading
        eyebrow="Portfolio · revenue"
        title="Revenue transparency"
        subtitle="No villas linked to your account yet."
      />
    );
  }
  let monthly: RevenueSourceMonthlyRow[] = [];
  let metricsCurrency: string | null = null;
  let totalGross = 0n;
  let totalNet = 0n;
  let bookingCount = 0;
  let occupiedNights = 0;
  for (const ownerId of ownerIds) {
    const rows = await listOwnerRevenueSourceMonthly(ownerId);
    monthly = monthly.concat(rows);
    const m = await getOwnerRevenueMetrics(ownerId);
    if (!metricsCurrency) metricsCurrency = m.currency;
    totalGross += m.totalGrossMinor;
    totalNet += m.totalNetEffectMinor;
    bookingCount += m.bookingCount;
    occupiedNights += m.occupiedNights;
  }
  const currency = metricsCurrency ?? "USD";
  const sourceMix = summarizeOwnerRevenueSourceMix(monthly, currency);
  const adr =
    occupiedNights > 0 ? calculateAdrMinor(totalGross, occupiedNights) : 0n;

  return (
    <>
      <SectionHeading
        eyebrow="Portfolio · revenue"
        title="Revenue transparency"
        subtitle="Where your villa revenue came from across direct bookings, OTAs, owner stays, and guest services. Owner statements remain the canonical record; this page makes the source mix legible at a glance."
      />

      <Card style={{ padding: "14px 20px", marginBottom: 18 }}>
        <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5, margin: 0 }}>
          <strong style={{ color: "var(--ink)" }}>Read this view as:</strong> a
          revenue-source breakdown, not a ledger. Money is shown in IDR (Rupiah)
          only — currency conversion is not applied yet. The owner statement
          remains the legal / accounting record once issued and approved.
        </p>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Gross revenue" value={formatMoneyMinor(totalGross, currency)} />
        <Kpi label="Net owner effect" value={formatMoneyMinor(totalNet, currency)} tone="success" />
        <Kpi label="Bookings" value={String(bookingCount)} />
        <Kpi label="Occupied nights" value={String(occupiedNights)} />
      </div>

      <h2 className="display" style={{ fontSize: 22, marginBottom: 6, fontWeight: 500 }}>
        Source mix · direct vs OTA vs other
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 14, marginTop: 0 }}>
        Direct bookings carry no OTA commission but still include payment, admin,
        or management fees that may appear on your statement.
      </p>
      {sourceMix.length === 0 ? (
        <Card style={{ padding: 24, marginBottom: 24 }}>
          <NoItemsYet
            entityLabel="revenue rows"
            description="No revenue recorded for this period yet. Once bookings settle and statements close, source-mix breakdown lands here."
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {sourceMix.map((s) => (
            <Card key={s.bucket} style={{ padding: 20 }}>
              <div className="label">{s.label}</div>
              <div className="display" style={{ fontSize: 24, fontWeight: 500, fontVariantNumeric: "tabular-nums", marginTop: 6 }}>
                {formatMoneyMinor(s.netOwnerEffectMinor, currency)}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
                {s.bookingCount} booking{s.bookingCount === 1 ? "" : "s"} ·{" "}
                {s.occupiedNights} night{s.occupiedNights === 1 ? "" : "s"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                ADR{" "}
                {s.occupiedNights > 0
                  ? formatMoneyMinor(s.averageRevenuePerNightMinor, currency)
                  : "—"}
              </div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="display" style={{ fontSize: 22, marginBottom: 6, fontWeight: 500 }}>
        Monthly buckets · by month and source
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 14, marginTop: 0 }}>
        One row per month / source. Check-in date determines the bucket.
      </p>
      {monthly.length === 0 ? (
        <Card style={{ padding: 24 }}>
          <NoItemsYet
            entityLabel="monthly buckets"
            description="No bucket rows yet. Bucket rows are computed by the owner-revenue projection rebuild — your portfolio admin can trigger one from the admin panel."
          />
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table className="data">
            <thead>
              <tr>
                <th>Month</th>
                <th>Source</th>
                <th className="num">Gross</th>
                <th className="num">Net effect</th>
                <th className="num">Nights</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((r, i) => (
                <tr key={`${r.periodMonth}-${r.sourceType}-${i}`}>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {r.periodMonth.slice(0, 7)}
                  </td>
                  <td style={{ fontSize: 12 }}>{r.sourceType}</td>
                  <td className="num">{formatMoneyMinor(r.grossRevenueMinor, r.currency)}</td>
                  <td className="num">{formatMoneyMinor(r.netOwnerEffectMinor, r.currency)}</td>
                  <td className="num">{r.occupiedNights}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 12 }}>
        Total monthly net owner effect:{" "}
        {formatMoneyMinor(totalNetOwnerEffectMinor(monthly, currency), currency)}.
        ADR (gross / occupied nights):{" "}
        {occupiedNights > 0 ? formatMoneyMinor(adr, currency) : "—"}.
      </p>
      <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 16 }}>
        Statements are the canonical financial record; revenue projections on
        this page are for operational transparency. Currency conversion is not
        applied in this view yet — original currencies are shown as posted. Use{" "}
        <Link href="/owner/statements" style={{ textDecoration: "underline" }}>
          your statements
        </Link>{" "}
        for the canonical net payout.
      </p>
    </>
  );
}
