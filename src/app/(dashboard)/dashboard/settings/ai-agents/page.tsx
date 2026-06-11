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
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Kpi } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import { orgAiAgentConfig } from "@/lib/db/schema/org-ai-agent-config";
import {
  AGENT_CATALOG,
  CONFIGURABLE_AGENTS,
  type ConfigurableAgentKey,
} from "@/features/ai-agents/agent-config-keys";
import { requireOrgId } from "@/features/auth/require-org";
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

function AiAgentsHeader() {
  return (
    <div className="page-header">
      <div className="left">
        <div className="crumb">
          <Link href="/dashboard/settings">Settings</Link> /{" "}
          <span>AI agents</span>
        </div>
        <h1>AI agents</h1>
        <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
          Configure which AI agents are active for your workspace. Plan tier
          sets the upper bound; the toggle here is your per-org override.
          Disabled agents stop firing immediately and surface the disabled
          state on their dashboard pages.
        </p>
      </div>
    </div>
  );
}

export default async function AiAgentSettingsPage() {
  const db = getDb();
  if (!db) {
    return (
      <>
        <AiAgentsHeader />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </>
    );
  }

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return (
      <>
        <AiAgentsHeader />
        <EmptyState
          title="No organization context"
          description="Sign in to manage AI agent configuration."
        />
      </>
    );
  }

  // Pull per-org overrides in one shot.
  const overrides = await db
    .select({
      agentKey: orgAiAgentConfig.agentKey,
      isEnabled: orgAiAgentConfig.isEnabled,
    })
    .from(orgAiAgentConfig)
    .where(eq(orgAiAgentConfig.organizationId, orgId));
  const overrideMap = new Map<string, boolean>(
    overrides.map((o) => [o.agentKey, o.isEnabled]),
  );

  // Resolve plan-tier eligibility for each agent in parallel.
  // Tier 3 → ai.agents_full; Tier 1+2 → ai.agents_basic.
  const eligibility = await Promise.all(
    CONFIGURABLE_AGENTS.map(async (key) => {
      const tier = AGENT_CATALOG[key].tier;
      const flag = tier === 3 ? "ai.agents_full" : "ai.agents_basic";
      const result = await getFeatureForOrg(orgId, flag);
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

  const planAllowedCount = rows.filter((r) => r.planAllows).length;
  const enabledCount = rows.filter(
    (r) =>
      r.planAllows &&
      (r.isEnabledOverride === null || r.isEnabledOverride === true),
  ).length;

  return (
    <>
      <AiAgentsHeader />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Configurable agents"
          value={String(rows.length)}
          sub="catalog surfaces"
        />
        <Kpi
          label="Allowed by plan"
          value={String(planAllowedCount)}
          sub="plan-tier eligible"
          tone={planAllowedCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Enabled"
          value={String(enabledCount)}
          sub="effectively active"
          tone={enabledCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Org overrides"
          value={String(overrides.length)}
          sub="per-org config rows"
        />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        Catalog · <em>{rows.length}</em>
      </h2>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Agent</th>
              <th scope="col">Tier</th>
              <th scope="col">Plan</th>
              <th scope="col">Status</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const desc = AGENT_CATALOG[r.agentKey];
              const effectivelyEnabled =
                r.planAllows &&
                (r.isEnabledOverride === null || r.isEnabledOverride === true);
              return (
                <tr key={r.agentKey}>
                  <td>
                    <div className="font-medium text-ink">{desc.label}</div>
                    <div className="text-xs text-ink-3 mt-0.5">
                      {desc.blurb}
                    </div>
                  </td>
                  <td>
                    <Badge tone={TIER_TONE[desc.tier]}>Tier {desc.tier}</Badge>
                  </td>
                  <td className="text-xs">
                    {r.planAllows ? (
                      <Badge tone="success">Allowed</Badge>
                    ) : (
                      <span className="text-ink-3">
                        <Badge tone="neutral">Not in plan</Badge>
                        <span className="block mt-1 text-[10px]">
                          ({r.planReason ?? "unknown"})
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="text-xs">
                    {!r.planAllows ? (
                      <Badge tone="neutral">—</Badge>
                    ) : effectivelyEnabled ? (
                      <Badge tone="success">Enabled</Badge>
                    ) : (
                      <Badge tone="warning">Disabled by org</Badge>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      {r.planAllows && (
                        <ToggleAgentButton
                          agentKey={r.agentKey}
                          currentEnabled={effectivelyEnabled}
                        />
                      )}
                      <Link
                        href={`/dashboard/settings/ai-agents/${r.agentKey}`}
                        className="btn btn-secondary btn-sm"
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

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        Per-tenant integrations
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5">
        These configuration surfaces also affect AI behavior. Each lives in
        its own settings page; this hub surfaces the pointers.
      </p>
      <ul className="space-y-3 mb-[18px]">
        <li className="card card-pad flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-ink">WhatsApp credentials</div>
            <div className="text-xs text-ink-3 mt-0.5">
              Per-tenant Twilio account + phone number for AI WhatsApp output.
              Credentials are stored encrypted.
            </div>
          </div>
          {/* Cross-subdomain in prod — plain <a> (Link prefetch dies on CORS). */}
          <a
            href="/development-os/settings/whatsapp"
            className="btn btn-secondary btn-sm shrink-0"
          >
            Open →
          </a>
        </li>
        <li className="card card-pad flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-ink">Project memory</div>
            <div className="text-xs text-ink-3 mt-0.5">
              Per-project knowledge layer feeding agent retrieval. Populated
              automatically by agent runs + ingestion (Stage 7.0).
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- cross-subdomain target, Link prefetch dies on CORS */}
          <a
            href="/development-os/ai-agents/memory"
            className="btn btn-secondary btn-sm shrink-0"
          >
            Open →
          </a>
        </li>
      </ul>
    </>
  );
}
