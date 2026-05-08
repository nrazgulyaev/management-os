/**
 * Stage 9.F.1 — per-tenant AI agent configuration hub.
 *
 * Lists the 9 configurable surfaces (7 runnable agents + inbox + memory),
 * each with:
 *   - Tier badge (1 / 2 / 3) — drives the model used at runtime.
 *   - Plan-tier eligibility badge (allowed / not allowed by current plan).
 *   - Per-org enable/disable state (default: enabled if plan allows).
 *   - Link to the per-agent detail page.
 *
 * Plus two cross-link sections to existing per-tenant config surfaces:
 *   - WhatsApp credentials → /development-os/settings/whatsapp (Stage 7.F.C.2)
 *   - Project memory → /development-os/ai-agents/memory (Stage 7.0)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import { orgAiAgentConfig } from "@/lib/db/schema/org-ai-agent-config";
import {
  AGENT_CATALOG,
  CONFIGURABLE_AGENTS,
  type ConfigurableAgentKey,
} from "@/features/ai-agents/agent-config-keys";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { getFeatureForOrg } from "@/lib/billing/gating";
import { ToggleAgentButton } from "./toggle-agent-button";

export const metadata: Metadata = { title: "AI agents · Settings" };
export const dynamic = "force-dynamic";

const TIER_TONE: Record<number, "info" | "success" | "warning"> = {
  1: "info",
  2: "success",
  3: "warning",
};

interface RowData {
  agentKey: ConfigurableAgentKey;
  isEnabledOverride: boolean | null;
  planAllows: boolean;
  planReason: string | null;
}

export default async function AiAgentSettingsPage() {
  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="AI agents" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </div>
    );
  }

  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="AI agents" />
        <EmptyState
          title="No organization context"
          description="ARCONIQUE_DEFAULT organization missing — apply migration 0071."
        />
      </div>
    );
  }

  // Pull per-org overrides in one shot.
  const overrides = await db
    .select({
      agentKey: orgAiAgentConfig.agentKey,
      isEnabled: orgAiAgentConfig.isEnabled,
    })
    .from(orgAiAgentConfig)
    .where(eq(orgAiAgentConfig.organizationId, org.id));
  const overrideMap = new Map<string, boolean>(
    overrides.map((o) => [o.agentKey, o.isEnabled]),
  );

  // Resolve plan-tier eligibility for each agent in parallel.
  // Tier 3 → ai.agents_full; Tier 1+2 → ai.agents_basic.
  const eligibility = await Promise.all(
    CONFIGURABLE_AGENTS.map(async (key) => {
      const tier = AGENT_CATALOG[key].tier;
      const flag = tier === 3 ? "ai.agents_full" : "ai.agents_basic";
      const result = await getFeatureForOrg(org.id, flag);
      return {
        key,
        planAllows: result.enabled,
        planReason: result.enabled ? null : result.reason,
      };
    }),
  );

  const rows: RowData[] = eligibility.map((e) => ({
    agentKey: e.key,
    isEnabledOverride: overrideMap.has(e.key)
      ? overrideMap.get(e.key)!
      : null,
    planAllows: e.planAllows,
    planReason: e.planReason,
  }));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "AI agents" },
        ]}
        title="AI agents"
        description="Configure which AI agents are active for your workspace. Plan tier sets the upper bound; the toggle here is your per-org override. Disabled agents stop firing immediately and surface the disabled state on their dashboard pages."
      />

      <Section
        eyebrow="Catalog"
        title={`${rows.length} configurable agent${rows.length === 1 ? "" : "s"}`}
      >
        <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50">
              <tr className="text-left text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => {
                const desc = AGENT_CATALOG[r.agentKey];
                const effectivelyEnabled =
                  r.planAllows &&
                  (r.isEnabledOverride === null || r.isEnabledOverride === true);
                return (
                  <tr key={r.agentKey}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{desc.label}</div>
                      <div className="text-xs text-ink-secondary mt-0.5">
                        {desc.blurb}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={TIER_TONE[desc.tier]}>Tier {desc.tier}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.planAllows ? (
                        <Badge tone="success">Allowed</Badge>
                      ) : (
                        <span className="text-ink-tertiary">
                          <Badge tone="neutral">Not in plan</Badge>
                          <span className="block mt-1 text-[10px]">
                            ({r.planReason ?? "unknown"})
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {!r.planAllows ? (
                        <Badge tone="neutral">—</Badge>
                      ) : effectivelyEnabled ? (
                        <Badge tone="success">Enabled</Badge>
                      ) : (
                        <Badge tone="warning">Disabled by org</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {r.planAllows && (
                          <ToggleAgentButton
                            agentKey={r.agentKey}
                            currentEnabled={effectivelyEnabled}
                          />
                        )}
                        <Link
                          href={`/dashboard/settings/ai-agents/${r.agentKey}`}
                          className="rounded-full border border-line-soft bg-surface px-3 py-1 text-xs hover:bg-muted/40"
                        >
                          Configure
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        eyebrow="Per-tenant integrations"
        title="WhatsApp + Memory"
        description="These configuration surfaces also affect AI behavior. Each lives in its own settings page; this hub surfaces the pointers."
      >
        <ul className="space-y-3">
          <li className="rounded border border-line-soft bg-surface px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-medium">WhatsApp credentials</div>
              <div className="text-xs text-ink-secondary mt-0.5">
                Per-tenant Twilio account + phone number for AI WhatsApp output.
                Credentials are stored encrypted.
              </div>
            </div>
            <Link
              href="/development-os/settings/whatsapp"
              className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:underline"
            >
              Open <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Link>
          </li>
          <li className="rounded border border-line-soft bg-surface px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-medium">Project memory</div>
              <div className="text-xs text-ink-secondary mt-0.5">
                Per-project knowledge layer feeding agent retrieval. Populated
                automatically by agent runs + ingestion (Stage 7.0).
              </div>
            </div>
            <Link
              href="/development-os/ai-agents/memory"
              className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:underline"
            >
              Open <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Link>
          </li>
        </ul>
      </Section>
    </div>
  );
}
