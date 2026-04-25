import Link from "next/link";
import { HeroSection } from "@/components/marketing/hero-section";
import { EditorialSection } from "@/components/marketing/editorial-section";
import { Button } from "@/components/ui/button";
import { StatusPill, statusLabel } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import { ScrollStagger, ScrollStaggerItem } from "@/components/motion/scroll-reveal";
import { statusBoardSummary } from "@/lib/mock/operations";

export const metadata = { title: "Operations technology" };

export default function OperationsPage() {
  return (
    <>
      <HeroSection
        kind="pillar"
        eyebrow="Operations technology"
        title="The calm machinery behind a great stay."
        description="Housekeeping, maintenance, procurement, preventive inspections, smart access, and cameras — unified on one platform with photo-verified evidence on every turnover."
        primaryCta={{ label: "See the field app", href: "/field" }}
        secondaryCta={{ label: "Open the ops board", href: "/dashboard/operations" }}
      />

      {/* Status board mini */}
      <EditorialSection
        eyebrow="Status board"
        title="Every villa. Every status. One source of truth."
        description="Occupied, checkout pending, cleaning in progress, supervisor inspection, ready for check-in, maintenance blocked, owner stay, out of service. Transitions are event-driven — not typed into a chat."
      >
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-line-soft flex items-center justify-between">
            <span className="text-label">Live · 19 villas across 3 projects</span>
            <span className="text-[11px] text-ink-tertiary">Updated just now</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 divide-x divide-y md:divide-y-0 divide-line-soft">
            {statusBoardSummary.map((s) => (
              <div key={s.status} className="p-4 flex flex-col gap-1.5">
                <div className="text-[10px] uppercase tracking-widest text-ink-tertiary truncate">
                  {statusLabel[s.status]}
                </div>
                <div className="font-mono tabular-nums text-2xl text-ink">
                  {s.count}
                </div>
              </div>
            ))}
          </div>
        </div>
      </EditorialSection>

      {/* Field app */}
      <EditorialSection
        eyebrow="Field app"
        title="Mobile-first, offline-capable, built for Bali."
        description="Staff run turnovers, maintenance, and inspections on low-end Androids in humid villas with two bars of signal. Photo uploads queue offline and sync the moment connection returns."
        invert
        columns={[
          {
            meta: "Housekeeping",
            title: "Photo-verified checklists",
            body: "Every stay closes with timestamped photos and supervisor approval. No phantom turnovers.",
          },
          {
            meta: "Maintenance",
            title: "SLA-tracked tickets",
            body: "P1–P4 priorities with SLAs. Escalations fire automatically when deadlines slip.",
          },
          {
            meta: "Preventive",
            title: "Automatic scheduling",
            body: "Quarterly AC service, monthly pest, annual fire-safety — scheduled, assigned, archived.",
          },
          {
            meta: "Access",
            title: "Time-boxed codes",
            body: "Guest and staff smart-lock codes expire automatically. Every use logged to the second.",
          },
        ]}
      />

      {/* Sample turnover preview */}
      <EditorialSection
        eyebrow="Sample turnover"
        title="A turnover, end-to-end."
        description="From checkout event to ready-for-check-in. Each step is timestamped, attributable, and visible to the right roles only."
      >
        <ScrollStagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { villa: "ES-S2", status: "occupied", note: "Departure 10:30 — Mr. Tanaka" },
            { villa: "ES-S2", status: "cleaning", note: "Sari W. · 11/18 items · 4 photos" },
            { villa: "ES-S2", status: "inspection", note: "Dewi K. supervisor · 22/22 items" },
            { villa: "ES-S2", status: "ready", note: "Check-in 15:00 — Family Nielsen" },
          ].map((step, i) => (
            <ScrollStaggerItem
              key={i}
              className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink-tertiary">
                  Step {i + 1}
                </span>
                <StatusPill
                  status={step.status as "occupied" | "cleaning" | "inspection" | "ready"}
                />
              </div>
              <div>
                <div className="text-ink font-medium text-sm">{step.villa}</div>
                <div className="text-xs text-ink-secondary mt-1 leading-relaxed">
                  {step.note}
                </div>
              </div>
            </ScrollStaggerItem>
          ))}
        </ScrollStagger>
      </EditorialSection>

      {/* Smart access */}
      <EditorialSection
        eyebrow="Smart access & cameras"
        title="Privacy-first by design. Audit-logged by default."
        invert
        columns={[
          {
            title: "Time-boxed lock codes",
            body: "Guest codes activate at T-24h and revoke at T+3h after checkout. Staff codes scoped to the shift.",
          },
          {
            title: "Physical key tracking",
            body: "Every checked-out key has a holder, a time stamp, and a return record. Lost keys trigger a re-key workflow.",
          },
          {
            title: "Reason-gated cameras",
            body: "Camera access is logged with reason codes. Common areas only — privacy boundaries enforced at the registry.",
          },
          {
            title: "Owner visibility",
            body: "Owners can review camera access history for their own villas. Staff cannot view other villas' feeds.",
          },
        ]}
      >
        <div className="mt-6 flex flex-wrap gap-2 justify-end">
          <Badge tone="outline">Hardware integrations land in v8</Badge>
        </div>
      </EditorialSection>

      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 text-center">
          <h2 className="text-display text-[34px] md:text-[48px] leading-[1.04] font-medium max-w-3xl mx-auto">
            Replace the WhatsApp groups with a real operating picture.
          </h2>
          <div className="mt-8 flex justify-center gap-3 flex-wrap">
            <Button asChild size="lg">
              <Link href="/contact">Talk to our operations team</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/dashboard/operations">Open the ops board</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
