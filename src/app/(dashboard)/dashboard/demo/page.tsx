import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import {
  listDemoScenarios,
  type DemoScenario,
  type DemoScenarioCategory,
} from "@/features/demo-data/demo-scenarios";
import {
  summariseKnownIssues,
  listDeferredToPostV1,
} from "@/features/prelaunch/known-issues";
import {
  COMPLETENESS_SECTIONS,
  summariseCompleteness,
} from "@/features/demo-data/completeness-overview";
import { isDbConfigured, isDemoMode } from "@/lib/env";

export const metadata = { title: "Demo walkthrough" };
export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<DemoScenarioCategory, string> = {
  owner_portal: "Owner portal",
  guest_stay: "Guest stay",
  direct_booking: "Direct booking",
  field_app: "Field app",
  vendor_portal: "Vendor portal",
  finance: "Finance",
  operations: "Operations",
  pricing: "Pricing",
  security_jobs: "Security & jobs",
};

export default function DemoWalkthroughPage() {
  const scenarios = listDemoScenarios();
  const issuesSummary = summariseKnownIssues();
  const deferredIssues = listDeferredToPostV1();
  const dbReady = isDbConfigured();
  const demoMode = isDemoMode();
  const completeness = summariseCompleteness();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Demo walkthrough" }]}
        title="Demo walkthrough"
        description="One launchpad for every Management OS demo flow. Each card lists what you should see, the live links, and the env / token caveats. Pair with docs/QA-DEMO-WALKTHROUGH.md for the screenshot-ready checklist."
      />

      <div className="rounded-md border border-line-soft bg-canvas px-5 py-3 text-xs text-ink-secondary leading-relaxed flex flex-wrap items-center gap-3">
        <span className="font-medium text-ink">
          Management OS v1 — pre-launch
        </span>
        <Badge tone={dbReady ? "success" : "warning"}>
          {dbReady ? "DB configured" : "Demo mock data"}
        </Badge>
        <Badge tone={demoMode ? "warning" : "neutral"}>
          {demoMode ? "DEMO_MODE on" : "DEMO_MODE off"}
        </Badge>
        <span className="text-ink-tertiary">
          See{" "}
          <span className="font-mono">
            docs/MANAGEMENT_OS_V1_PRODUCT_MAP.md
          </span>{" "}
          for the full module map.
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Completeness score"
          value={`${completeness.score}/100`}
          accent={completeness.score < 80}
        />
        <MetricCard
          label="Populated surfaces"
          value={`${completeness.populated}/${completeness.total}`}
        />
        <MetricCard
          label="Demo scenarios"
          value={String(scenarios.length)}
        />
        <MetricCard
          label="Accepted limitations"
          value={String(issuesSummary.byStatus.accepted)}
        />
      </div>

      <div className="rounded-md border border-line-soft bg-canvas px-5 py-3 text-xs text-ink-secondary leading-relaxed">
        Demo data:{" "}
        <strong className="text-ink">
          {dbReady ? "ready" : "not yet seeded"}
        </strong>
        . Each module below is rated against the live database; click any
        row to open the surface.
      </div>

      <Section
        eyebrow="Completeness"
        title="Module-by-module status"
        description="Click any row to open the surface. Every populated row has live or static demo data; fallback rows render polished placeholder copy; empty-accepted rows are intentional (e.g. no security events on a fresh DB)."
      >
        <div className="flex flex-col gap-6">
          {COMPLETENESS_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-medium text-ink">{section.title}</h3>
              <p className="text-xs text-ink-tertiary mt-1 mb-3 leading-relaxed">
                {section.description}
              </p>
              <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                {section.entries.map((e) => (
                  <li key={e.href} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href={e.href}
                        className="text-sm text-ink hover:underline"
                      >
                        {e.label}
                      </Link>
                      <span className="text-[11px] text-ink-tertiary">
                        {e.notes}
                      </span>
                    </div>
                    <Badge
                      tone={
                        e.status === "populated"
                          ? "success"
                          : e.status === "fallback"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {e.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Recommended flows"
        title="What to demo"
        description="Pick the flow that matches your audience. Each scenario card below provides the live links and the supporting QA checklist."
        variant="panel"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border border-line-soft bg-canvas p-4">
            <div className="text-label mb-1">Investor / operator · 20 min</div>
            <ol className="list-decimal pl-4 text-xs text-ink-secondary space-y-1">
              <li>/owner — portfolio + value prop</li>
              <li>/owner/calendar — direct vs OTA</li>
              <li>/owner/revenue — source mix</li>
              <li>/owner/statements — canonical record</li>
              <li>/dashboard/finance/transparency — operator view</li>
              <li>/dashboard/system/deployment — readiness</li>
            </ol>
          </div>
          <div className="rounded-md border border-line-soft bg-canvas p-4">
            <div className="text-label mb-1">Technical · 45 min</div>
            <ol className="list-decimal pl-4 text-xs text-ink-secondary space-y-1">
              <li>/dashboard/system/health — module groups</li>
              <li>/dashboard/system/storage — bucket inventory</li>
              <li>/dashboard/jobs — cron catalog</li>
              <li>/dashboard/security — MFA / audit / login</li>
              <li>/dashboard/ai — AI Operations Co-pilot</li>
              <li>/stay/demo + /vendor/service/[token]</li>
            </ol>
          </div>
          <div className="rounded-md border border-warning/40 bg-warning-weak/20 p-4">
            <div className="text-label mb-1">Do not demo yet</div>
            <ul className="list-disc pl-4 text-xs text-ink-secondary space-y-1">
              <li>Real card capture (manual stub only)</li>
              <li>Smart-lock integrations (stub)</li>
              <li>OTA write back / channel push (simulation)</li>
              <li>WhatsApp / Telegram concierge (deferred)</li>
              <li>AI write tools (read-only in v1)</li>
            </ul>
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenarios.map((s) => (
          <ScenarioCard key={s.title} scenario={s} />
        ))}
      </div>

      <Section
        eyebrow="Known limitations"
        title="What is still stubbed"
        description="These are the documented Management OS v1 trade-offs. Each item links back to its ADR. The full list lives in src/features/prelaunch/known-issues.ts."
      >
        <div className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
          {deferredIssues.slice(0, 8).map((i) => (
            <div key={i.id} className="px-5 py-3 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{i.id}</Badge>
                <span className="text-sm text-ink">{i.title}</span>
                <Badge
                  tone={i.severity === "important" ? "warning" : "outline"}
                >
                  {i.severity}
                </Badge>
              </div>
              <p className="text-[11px] text-ink-tertiary">{i.notes}</p>
            </div>
          ))}
        </div>
      </Section>

      <p className="text-xs text-ink-tertiary leading-relaxed">
        Demo tokens (hold / stay / vendor) are never persisted in plain text.
        Links marked <Badge tone="warning">requires live token</Badge> need a
        token minted via the corresponding admin or public form first — see
        the QA walkthrough doc for the exact steps. For the full v1 product
        map, see{" "}
        <span className="font-mono">docs/MANAGEMENT_OS_V1_PRODUCT_MAP.md</span>{" "}
        and{" "}
        <span className="font-mono">
          docs/MANAGEMENT_OS_LAUNCH_READINESS_SUMMARY.md
        </span>
        .
      </p>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: DemoScenario }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            {CATEGORY_LABELS[scenario.category]}
          </span>
          <h3 className="text-sm font-medium text-ink mt-1">
            {scenario.title}
          </h3>
        </div>
      </div>
      <p className="text-xs text-ink-secondary leading-relaxed">
        {scenario.expect}
      </p>
      <Section eyebrow="Links" title="" description={undefined}>
        <ul className="flex flex-col gap-1 text-xs">
          {scenario.links.map((l) => (
            <li
              key={l.href}
              className="flex items-center justify-between gap-3"
            >
              {l.requiresLiveToken ? (
                <span className="text-ink-tertiary">{l.label}</span>
              ) : (
                <Link
                  href={l.href}
                  className="text-ink hover:underline underline-offset-4"
                >
                  {l.label}
                </Link>
              )}
              {l.requiresLiveToken && (
                <Badge tone="warning">requires live token</Badge>
              )}
            </li>
          ))}
        </ul>
      </Section>
      {scenario.caveats && scenario.caveats.length > 0 && (
        <ul className="text-[11px] text-ink-tertiary list-disc pl-4 space-y-1">
          {scenario.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {scenario.envHints && scenario.envHints.length > 0 && (
        <div className="rounded-md border border-line-soft bg-canvas p-3 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-ink-tertiary">
            Env hints
          </span>
          {scenario.envHints.map((e) => (
            <code key={e} className="text-[11px] text-ink-secondary">
              {e}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}
