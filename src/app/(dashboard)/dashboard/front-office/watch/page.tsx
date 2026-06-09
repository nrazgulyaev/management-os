import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/dashboard/primitives";
import { detectTurnoverRisks, detectVisaWatch } from "@/features/front-office/watch-agents";

export const metadata = { title: "Front office — Watch" };
export const dynamic = "force-dynamic";

/**
 * FC-MANAGEMENT-FRONT-OFFICE §agents — front-office watch panel. Runs the
 * deterministic monitors live over today's data.
 */
export default async function FrontOfficeWatchPage() {
  const now = new Date();
  const [turnover, visa] = await Promise.all([detectTurnoverRisks(now), detectVisaWatch(now)]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Front office", href: "/dashboard/front-office" },
          { label: "Watch" },
        ]}
        title="Watch — front-office agents"
        description="Deterministic monitors over today's data. turnover-monitor flags villas not ready for an arrival; visa-watcher flags guest IDs that lapse during the stay."
      />

      <Section
        eyebrow="turnover-monitor"
        title={`${turnover.length} villa${turnover.length === 1 ? "" : "s"} not ready`}
      >
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
                      <Badge tone="warning">{t.readinessStatus}</Badge>
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
      </Section>

      <Section
        eyebrow="visa-watcher"
        title={`${visa.length} ID${visa.length === 1 ? "" : "s"} to watch`}
      >
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
                      <Badge tone={v.severity === "expired" ? "danger" : "warning"}>
                        {v.severity === "expired" ? "expired" : "expires during stay"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Section eyebrow="vip-prep" title="Not yet available">
        <Card padding="default">
          <p className="text-sm text-ink-tertiary m-0">
            vip-prep needs a VIP signal on bookings/guests — none exists in the schema yet. Add an
            <code className="font-mono text-xs"> is_vip </code> flag (or a booking-value threshold)
            and this agent will flag arrival prep for VIP guests.
          </p>
        </Card>
      </Section>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty m-0 text-sm text-ink-3">{children}</p>;
}
