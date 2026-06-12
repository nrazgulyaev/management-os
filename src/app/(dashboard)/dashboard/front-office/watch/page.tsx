import Link from "next/link";
import { Card, HandoffBadge, Kpi } from "@/components/dashboard/primitives";
import {
  detectTurnoverRisks,
  detectVisaWatch,
  detectVipPrep,
} from "@/features/front-office/watch-agents";

export const metadata = { title: "Front office — Watch" };
export const dynamic = "force-dynamic";

/**
 * FC-MANAGEMENT-FRONT-OFFICE §agents — front-office watch panel. Runs the
 * deterministic monitors live over today's data.
 */
export default async function FrontOfficeWatchPage() {
  const now = new Date();
  const [turnover, visa, vip] = await Promise.all([
    detectTurnoverRisks(now),
    detectVisaWatch(now),
    detectVipPrep(now),
  ]);

  const expiredIds = visa.filter((v) => v.severity === "expired").length;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/front-office">Front office</Link> / <span>Watch</span>
          </div>
          <h1>Watch — front-office agents</h1>
        </div>
      </div>

      <p className="mt-3 mb-7 text-[15px] text-ink-3 max-w-[680px]">
        Deterministic monitors over today&apos;s data. turnover-monitor flags villas
        not ready for an arrival; visa-watcher flags guest IDs that lapse during
        the stay; vip-prep flags VIP arrivals for white-glove prep.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Kpi
          label="Turnover risks"
          value={String(turnover.length)}
          sub={turnover.length > 0 ? "villas not ready" : "all villas ready"}
          tone={turnover.length > 0 ? "danger" : "success"}
        />
        <Kpi
          label="IDs to watch"
          value={String(visa.length)}
          sub={visa.length > 0 ? "lapse during stay" : "no expiries in stays"}
          tone={visa.length > 0 ? "gold" : "success"}
        />
        <Kpi
          label="Expired IDs"
          value={String(expiredIds)}
          sub="already lapsed"
          tone={expiredIds > 0 ? "danger" : "success"}
        />
        <Kpi
          label="VIP arrivals"
          value={String(vip.length)}
          sub={vip.length > 0 ? "need prep today" : "none arriving today"}
          tone={vip.length > 0 ? "gold" : "success"}
        />
      </div>

      <div className="flex flex-col gap-8">
        <section>
          <div className="section-heading">
            <div className="eyebrow label">turnover-monitor</div>
            <h2>
              {turnover.length} villa{turnover.length === 1 ? "" : "s"} not ready
            </h2>
          </div>
          {turnover.length === 0 ? (
            <Empty>All arriving villas are ready.</Empty>
          ) : (
            <Card padding="none" overflowHidden>
              <table className="data">
                <thead>
                  <tr>
                    <th>Villa</th>
                    <th>Guest</th>
                    <th>Readiness</th>
                    <th className="num" />
                  </tr>
                </thead>
                <tbody>
                  {turnover.map((t) => (
                    <tr key={t.bookingId}>
                      <td className="row-title">{t.villaCode ?? "—"}</td>
                      <td className="text-ink-2">{t.guestDisplay}</td>
                      <td>
                        <HandoffBadge tone="warn">{t.readinessStatus}</HandoffBadge>
                      </td>
                      <td className="num">
                        <Link
                          href="/dashboard/front-office/arrivals"
                          className="text-xs text-ink-2 hover:text-accent"
                        >
                          Arrivals →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>

        <section>
          <div className="section-heading">
            <div className="eyebrow label">visa-watcher</div>
            <h2>
              {visa.length} ID{visa.length === 1 ? "" : "s"} to watch
            </h2>
          </div>
          {visa.length === 0 ? (
            <Empty>No ID/visa expiries during current stays.</Empty>
          ) : (
            <Card padding="none" overflowHidden>
              <table className="data">
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th>Villa</th>
                    <th className="num">Expires</th>
                    <th className="num">Checkout</th>
                    <th>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {visa.map((v) => (
                    <tr key={v.bookingId}>
                      <td className="row-title">{v.guestName ?? "—"}</td>
                      <td className="text-ink-2">{v.villaCode ?? "—"}</td>
                      <td className="num text-ink-2">{v.expiresAt ?? "—"}</td>
                      <td className="num text-ink-3">{v.checkOut}</td>
                      <td>
                        <HandoffBadge tone={v.severity === "expired" ? "danger" : "warn"}>
                          {v.severity === "expired" ? "expired" : "expires during stay"}
                        </HandoffBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>

        <section>
          <div className="section-heading">
            <div className="eyebrow label">vip-prep</div>
            <h2>
              {vip.length} VIP arrival{vip.length === 1 ? "" : "s"}
            </h2>
          </div>
          {vip.length === 0 ? (
            <Empty>No VIP guests arriving today.</Empty>
          ) : (
            <Card padding="none" overflowHidden>
              <table className="data">
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th>Villa</th>
                    <th className="num">Check-in</th>
                    <th>Notes</th>
                    <th className="num" />
                  </tr>
                </thead>
                <tbody>
                  {vip.map((v) => (
                    <tr key={v.bookingId}>
                      <td className="row-title">
                        {v.guestDisplay}{" "}
                        <HandoffBadge tone="gold">VIP</HandoffBadge>
                      </td>
                      <td className="text-ink-2">{v.villaCode ?? "—"}</td>
                      <td className="num text-ink-3">{v.checkIn}</td>
                      <td className="text-ink-2">{v.notes ?? "—"}</td>
                      <td className="num">
                        <Link
                          href="/dashboard/front-office/arrivals"
                          className="text-xs text-ink-2 hover:text-accent"
                        >
                          Arrivals →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty m-0 text-sm text-ink-3">{children}</p>;
}
