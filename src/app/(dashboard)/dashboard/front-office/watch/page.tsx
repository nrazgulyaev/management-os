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
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Guest</th>
                  <th className="text-left px-3 py-2">Readiness</th>
                  <th className="text-left px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {turnover.map((t) => (
                  <tr key={t.bookingId}>
                    <td className="px-3 py-2 text-ink">{t.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{t.guestDisplay}</td>
                    <td className="px-3 py-2">
                      <Badge tone="warning">{t.readinessStatus}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href="/dashboard/front-office/arrivals"
                        className="text-xs text-ink-secondary hover:text-accent"
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
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Guest</th>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Expires</th>
                  <th className="text-left px-3 py-2">Checkout</th>
                  <th className="text-left px-3 py-2">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {visa.map((v) => (
                  <tr key={v.bookingId}>
                    <td className="px-3 py-2 text-ink">{v.guestName ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{v.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary tabular-nums">{v.expiresAt ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">{v.checkOut}</td>
                    <td className="px-3 py-2">
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
  return (
    <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
      {children}
    </p>
  );
}
