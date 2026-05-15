import {
  ActionPillButton,
  FeatureDeepDive,
  FeatureTOC,
  PhotographicHero,
  type FeatureTOCItem,
} from "@/components/landing";

/**
 * Sprint LD-2 — /features/development-os deep-dive page.
 *
 * Closes the "Learn more →" loop from the LD-1 Dev-OS product
 * landing. Same shape as /features/management-os, six dev-side
 * sections.
 */

export const metadata = {
  title: "Development OS features · Arconique",
  description:
    "Six core capabilities. One development operating system. BOQ tracking, AI cost analyst, QA/QC, RFQ matrix, investor portal, site supervisor PWA.",
};

const TOC: FeatureTOCItem[] = [
  { id: "boq-live-tracking", label: "BOQ Live Tracking" },
  { id: "ai-cost-analyst", label: "AI Cost Analyst" },
  { id: "qa-qc", label: "QA / QC" },
  { id: "procurement-rfq", label: "Procurement RFQ" },
  { id: "investor-portal", label: "Investor Portal" },
  { id: "site-supervisor-pwa", label: "Site Supervisor PWA" },
];

export default function FeaturesDevelopmentOSPage() {
  return (
    <>
      <PhotographicHero
        bgImageSrc="/landing/hero-construction-sunrise.webp"
        headline="Everything that builds the next villa."
        subhead="Six core capabilities. One development OS. From BOQ to investor distributions."
        primaryCta={{ label: "Start 14-day trial", href: "/onboarding" }}
        secondaryCta={{ label: "See pricing", href: "/pricing" }}
      />

      <FeatureTOC items={TOC} />

      <FeatureDeepDive
        id="boq-live-tracking"
        eyebrow="BOQ live tracking"
        title="Excel-paste your BOQ. Get live variance forever."
        description={
          <>
            <p>
              Paste a 500-line BOQ from Excel; sections, items, and
              unit-rate columns map automatically. Each line carries
              hierarchical revision control so the issued-for-
              construction copy stays authoritative.
            </p>
            <p>
              AI variance flags fire the moment a PO total drifts from
              its BOQ baseline. The QS sees the outlier inline rather
              than discovering it at month-end.
            </p>
          </>
        }
        bullets={[
          "Excel-paste import that respects section hierarchy",
          "Revision control with one issued-for-construction copy",
          "AI variance flags fire the moment a PO drifts",
        ]}
        cabinetHref="/development-os/cabinets/qs"
        mockupSrc="/landing/feature-boq-tracking.webp"
        mockupAlt="BOQ spreadsheet with variance flag"
      />

      <FeatureDeepDive
        id="ai-cost-analyst"
        eyebrow="AI cost analyst"
        title="Anomalies caught before they ship."
        description={
          <>
            <p>
              The qs-cost-analyst agent reads unit costs against
              historical baselines, flags outliers, and drafts a
              human-readable explanation. Operator approves with one
              click; the rejection writes back into the BOQ revision.
            </p>
            <p>
              Runs on a nightly cron + on-demand from the cabinet apex.
              Every output audit-logged with the model call + input
              tokens + output tokens for finance reconciliation.
            </p>
          </>
        }
        bullets={[
          "Unit-cost outlier detection against historical baselines",
          "Human-readable anomaly explanations + recommended actions",
          "Per-invocation audit trail (model + tokens) for finance",
        ]}
        cabinetHref="/development-os/cabinets/qs"
        cabinetLabel="Tour the QS cabinet"
        mockupSrc="/landing/feature-ai-cost-analyst.webp"
        mockupAlt="qs-cost-analyst anomaly output card"
        reverse
      />

      <FeatureDeepDive
        id="qa-qc"
        eyebrow="QA / QC"
        title="Every site report cross-referenced with photo evidence."
        description={
          <>
            <p>
              Inspections are filed against acceptance criteria from
              the method-statement registry. Photos are geo-tagged at
              the source and surface inline against each criterion
              point.
            </p>
            <p>
              Reinspection workflows reassign vendors automatically when
              a criterion fails twice. The change-order trail stays
              intact across reassignment.
            </p>
          </>
        }
        bullets={[
          "Acceptance-criteria-driven inspection workflow",
          "Geo-tagged photo evidence inline against each criterion",
          "Automatic vendor reassignment on twice-failed criteria",
        ]}
        cabinetHref="/development-os/cabinets/site-supervisor"
        cabinetLabel="Tour the Site Supervisor cabinet"
        mockupSrc="/landing/feature-qa-qc.webp"
        mockupAlt="Photo-evidence QA inspection thread"
      />

      <FeatureDeepDive
        id="procurement-rfq"
        eyebrow="Procurement"
        title="Compare 5 supplier quotes side-by-side."
        description={
          <>
            <p>
              The RFQ matrix opens five suppliers in one view —
              quotation totals, payment terms, delivery dates, per-line
              unit prices, all aligned. Selected-vendor highlighting +
              price spread make the decision visible.
            </p>
            <p>
              Approved quotation transitions to a PO in one click; the
              commitments ledger updates automatically. Vendor
              performance accumulates per PO for the next RFQ cycle.
            </p>
          </>
        }
        bullets={[
          "Side-by-side RFQ matrix with 5 supplier columns",
          "Selected-vendor highlighting + price-spread call-out",
          "One-click quotation → PO with commitments-ledger update",
        ]}
        cabinetHref="/development-os/cabinets/procurement-manager"
        cabinetLabel="Tour the Procurement cabinet"
        mockupSrc="/landing/feature-procurement-rfq.webp"
        mockupAlt="RFQ matrix with 5 supplier columns"
        reverse
      />

      <FeatureDeepDive
        id="investor-portal"
        eyebrow="Investor portal"
        title="Investors don't email you for updates anymore."
        description={
          <>
            <p>
              A self-service investor dashboard with bilingual reports
              (EN / ES / ID / RU / ZH), real-time distribution history,
              and the capital-flow waterfall that maps committed →
              drawn → distributed → wallet.
            </p>
            <p>
              Document downloads, request submission, NAV history — all
              read-only and per-investor RLS-scoped. Owners + GPs see
              the same numbers their LPs see.
            </p>
          </>
        }
        bullets={[
          "Bilingual self-service dashboard (5 languages today)",
          "Capital-flow waterfall: committed → drawn → distributed",
          "Per-investor RLS so LP A never sees LP B's position",
        ]}
        cabinetHref="/investor-portal/dashboard"
        cabinetLabel="Tour the investor portal"
        mockupSrc="/landing/feature-investor-portal.webp"
        mockupAlt="Investor portal capital-flow waterfall"
      />

      <FeatureDeepDive
        id="site-supervisor-pwa"
        eyebrow="Site supervisor PWA"
        title="Field reports with offline-first photo + voice."
        description={
          <>
            <p>
              Daily site reports filed from the supervisor's phone.
              Photo capture survives intermittent 4G; voice notes auto-
              transcribe into the report body; checklists sign off at
              the source with a geo-tag.
            </p>
            <p>
              Reports sync in the background once the device is on
              wi-fi. The PM sees yesterday's exceptions in the daily
              digest the moment the supervisor presses Submit.
            </p>
          </>
        }
        bullets={[
          "Offline-first photo capture (survives flaky 4G)",
          "Voice notes auto-transcribed into the report body",
          "Geo-tagged checklists sign off at the source",
        ]}
        cabinetHref="/development-os/cabinets/site-supervisor"
        cabinetLabel="Tour the Site Supervisor cabinet"
        mockupSrc="/landing/feature-site-supervisor-pwa.webp"
        mockupAlt="Site supervisor PWA with voice note + photo"
        reverse
      />

      <section className="py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <div className="rounded-3xl bg-gradient-coral-soft shadow-elevated-card p-10 md:p-16 flex flex-col items-center text-center gap-6">
            <span className="text-label">Get started</span>
            <h2 className="font-display text-3xl md:text-5xl lg:text-6xl tracking-[-0.02em] text-ink leading-[1.05] max-w-3xl">
              Ready to build the next one with everyone in sync?
            </h2>
            <p className="text-base md:text-lg text-ink-secondary leading-relaxed max-w-xl">
              14-day free trial. No credit card. BOQ, procurement,
              QA/QC + investor portal in one workspace.
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
