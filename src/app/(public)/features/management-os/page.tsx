import {
  ActionPillButton,
  FeatureDeepDive,
  FeatureTOC,
  PhotographicHero,
  type FeatureTOCItem,
} from "@/components/landing";

/**
 * Sprint LD-2 — /features/management-os deep-dive page.
 *
 * Closes the "Learn more →" loop from the LD-1 product landing.
 * Each of the six features lives in an anchored <FeatureDeepDive>
 * section so the landing's per-card href
 * (`/features/management-os#<slug>`) drops the operator straight
 * into the relevant section. Sticky <FeatureTOC> pill row makes
 * jumping between sections free.
 */

export const metadata = {
  title: "Management OS features · Arconique",
  description:
    "Six core capabilities. One operating system. Channel manager, owner statements, Concierge AI, mobile cleaner PWA, direct booking, security.",
};

const TOC: FeatureTOCItem[] = [
  { id: "channel-manager", label: "Channel Manager" },
  { id: "owner-statements", label: "Owner Statements" },
  { id: "concierge-ai", label: "Concierge AI" },
  { id: "cleaner-pwa", label: "Mobile Cleaner PWA" },
  { id: "direct-booking", label: "Direct Booking" },
  { id: "security", label: "Security" },
];

export default function FeaturesManagementOSPage() {
  return (
    <>
      <PhotographicHero
        bgImageSrc="/landing/hero-villa-golden.webp"
        headline="Everything that runs your villa portfolio."
        subhead="Six core capabilities. One operating system. Built for Bali."
        primaryCta={{ label: "Start 14-day trial", href: "/onboarding" }}
        secondaryCta={{ label: "See pricing", href: "/pricing" }}
      />

      <FeatureTOC items={TOC} />

      <FeatureDeepDive
        id="channel-manager"
        eyebrow="Channel manager"
        title="One inbox for Booking, Airbnb, Agoda."
        description={
          <>
            <p>
              Seven OTA channels syncing per-villa, per-rate, per-day.
              Conflict detection on the read path catches a Booking.com
              over-allocation before it ships to Airbnb.
            </p>
            <p>
              Inbound messages collapse into a single inbox so the front
              desk doesn't bounce between five tabs. Every reply
              auditable. Every channel reconcile-able at month-end.
            </p>
          </>
        }
        bullets={[
          "Per-villa-per-channel sync with idempotent re-pull",
          "Calendar-collision prevention before push to OTAs",
          "Unified inbound message inbox across all channels",
        ]}
        cabinetHref="/dashboard/front-office"
        mockupSrc="/landing/feature-channel-manager.webp"
        mockupAlt="Multi-channel inbox preview"
      />

      <FeatureDeepDive
        id="owner-statements"
        eyebrow="Owner statements"
        title="Monthly statements, generated in one click."
        description={
          <>
            <p>
              Revenue collection from each OTA + direct, expense
              reconciliation against vendor invoices, owner-stay
              adjustments — every line traceable to its source.
            </p>
            <p>
              The PDF lands in the owner's inbox on a schedule you set,
              with line-by-line transparency. No more end-of-month
              spreadsheet panic.
            </p>
          </>
        }
        bullets={[
          "Per-villa revenue + expense ledger with full audit trail",
          "Owner-facing PDF auto-delivered on a configurable schedule",
          "Owner-stay equivalence + relocation adjustments handled",
        ]}
        cabinetHref="/owner"
        cabinetLabel="Tour the owner portal"
        mockupSrc="/landing/feature-owner-statements.webp"
        mockupAlt="Owner statement PDF preview"
        reverse
      />

      <FeatureDeepDive
        id="concierge-ai"
        eyebrow="Concierge AI"
        title="A 24/7 concierge that speaks your guest's language."
        description={
          <>
            <p>
              Multilingual chat across WhatsApp, email, and the in-stay
              web concierge. Routes service-catalog orders straight into
              the operations queue. Escalates to a human only on the
              edge cases.
            </p>
            <p>
              Every session is audit-logged — every refusal, every
              fallback, every model call. Operators see exactly what
              the guest asked and what the AI replied.
            </p>
          </>
        }
        bullets={[
          "Multilingual replies on WhatsApp + email + web chat",
          "Service catalog orders bridged into operations + finance",
          "Human handoff queue for edge cases with full transcript",
        ]}
        cabinetHref="/dashboard/concierge"
        mockupSrc="/landing/feature-concierge-ai.webp"
        mockupAlt="Concierge AI guest WhatsApp thread preview"
      />

      <FeatureDeepDive
        id="cleaner-pwa"
        eyebrow="Mobile field PWA"
        title="Built for cleaners, security, and supervisors."
        description={
          <>
            <p>
              Field staff work in an offline-first PWA — no app store,
              no install friction. Photo upload works on 4G, voice
              notes auto-transcribe, checklists sign off at the source
              with a geo-tagged completion stamp.
            </p>
            <p>
              The supervisor approves from a desktop the next morning;
              the audit trail is already complete.
            </p>
          </>
        }
        bullets={[
          "Offline-first photo upload that survives a flaky 4G run",
          "Voice notes transcribed by the AI for inspection logs",
          "Mobile checklists with geo-tagged completion at signoff",
        ]}
        cabinetHref="/dashboard/housekeeping"
        mockupSrc="/landing/feature-cleaner-pwa.webp"
        mockupAlt="Cleaner mobile PWA preview"
        reverse
      />

      <FeatureDeepDive
        id="direct-booking"
        eyebrow="Direct booking"
        title="Your villa, your URL, your margin."
        description={
          <>
            <p>
              A branded direct-booking site on a domain you control.
              Stripe-backed payment processing, channel-conflict-aware
              availability, owner-stay quota baked in.
            </p>
            <p>
              The standalone direct-booking surface is configured from
              the Front Office cabinet for now; a dedicated direct-
              booking workspace is on the roadmap.
            </p>
          </>
        }
        bullets={[
          "Branded checkout on a domain you own (no commission)",
          "Channel-aware availability so direct never overbooks",
          "Stripe + manual payment with VAT-correct invoicing",
        ]}
        cabinetHref="/dashboard/front-office"
        cabinetLabel="Configure from Front Office"
        mockupSrc="/landing/feature-direct-booking.webp"
        mockupAlt="Direct-booking site checkout preview"
      />

      <FeatureDeepDive
        id="security"
        eyebrow="Security"
        title="Patrols, incidents, access control."
        description={
          <>
            <p>
              Digital patrol logs replace the paper clipboard.
              Incidents surface on a severity-coded timeline. Camera
              registry links each device to the vendor app — we never
              stream video through our platform.
            </p>
            <p>
              Authentication events + login-attempt anomalies surface
              alongside physical patrols so security supervisors see
              one unified picture.
            </p>
          </>
        }
        bullets={[
          "Digital patrol logs with photo + voice evidence",
          "Severity-coded incident timeline (warn / alert / critical)",
          "Auth-event + camera-registry side-by-side dashboard",
        ]}
        cabinetHref="/dashboard/security"
        mockupSrc="/landing/feature-security.webp"
        mockupAlt="Security patrol log + camera registry preview"
        reverse
      />

      <section className="py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <div className="rounded-3xl bg-gradient-coral-soft shadow-elevated-card p-10 md:p-16 flex flex-col items-center text-center gap-6">
            <span className="text-label">Get started</span>
            <h2 className="font-display text-3xl md:text-5xl lg:text-6xl tracking-[-0.02em] text-ink leading-[1.05] max-w-3xl">
              Ready to run the whole portfolio from one place?
            </h2>
            <p className="text-base md:text-lg text-ink-secondary leading-relaxed max-w-xl">
              14-day free trial. No credit card. Every cabinet
              included. Cancel anytime, your data exports as CSV/XLSX
              if you leave.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <ActionPillButton
                label="Start trial"
                href="/onboarding"
                variant="primary"
                arrow
                size="lg"
              />
              <ActionPillButton
                label="Talk to sales"
                href="/contact"
                variant="secondary"
                size="lg"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
