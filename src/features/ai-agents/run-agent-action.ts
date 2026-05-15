"use server";

/**
 * Stage 8.B.1 — operator-triggered "Run now" for the 7 agent surfaces.
 *
 * Each cabinet's agent page lists historical agent_outputs but had no
 * affordance to fire a fresh run. This action lets an authorized
 * operator trigger an immediate kickoff: a small aiExecute() call
 * asking the agent to produce its current snapshot, persisted as an
 * agent_outputs row so it appears in the table on next render.
 *
 * Heavyweight cron-driven analyses still run on schedule; this is the
 * "give me something now" path.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";
import { orgAiAgentConfig } from "@/lib/db/schema/org-ai-agent-config";
import { aiExecute } from "@/lib/ai/execute";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
import { getAgentEligibility } from "./agent-config-actions";
import { RUN_NOW_AGENTS, type RunNowAgentKey } from "./run-agent-config";

export { RUN_NOW_AGENTS, type RunNowAgentKey };

const inputSchema = z.object({
  agentKey: z.enum(
    Object.keys(RUN_NOW_AGENTS) as [RunNowAgentKey, ...RunNowAgentKey[]],
  ),
});

export type RunAgentResult =
  | { ok: true; outputCode: string; runId: string; agentSlug: string }
  | { ok: false; error: string };

function generateOutputCode(agentKey: string): string {
  // Stable, sortable, human-recognisable. e.g. "qs_cost_analyst_20260508T1234"
  const ts = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 13); // YYYYMMDDHHMM
  return `${agentKey}_${ts}`;
}

export async function runAgentAction(
  input: z.input<typeof inputSchema>,
): Promise<RunAgentResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid agent key",
    };
  }
  const { agentKey } = parsed.data;
  const config = RUN_NOW_AGENTS[agentKey];

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  // TENANT-1 — resolve org from the authenticated session.
  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return { ok: false, error: "No organization context available." };
  }

  // Stage 9.F follow-up — gate on per-tenant eligibility BEFORE billing
  // hits aiExecute. Distinguishes plan-tier denial, no-subscription,
  // and per-org disable so the operator gets an actionable error
  // instead of a generic "AI access disabled".
  const eligibility = await getAgentEligibility(orgId, agentKey);
  if (!eligibility.eligible) {
    const message =
      eligibility.reason === "no_subscription"
        ? `${config.label} is not available — your workspace has no active subscription.`
        : eligibility.reason === "plan_excludes_agent"
          ? `${config.label} is not included in your current plan. Upgrade to enable it.`
          : eligibility.reason === "disabled_by_org"
            ? `${config.label} is disabled for your workspace. Re-enable it from /dashboard/settings/ai-agents.`
            : `${config.label} is not available right now.`;
    return { ok: false, error: message };
  }

  // Stage 9.F follow-up — load the per-org custom prompt override (if
  // set) and use it instead of the canonical kickoff prompt. Empty
  // override == fall back to canonical (the action's normalize step
  // already coerces empty/whitespace to NULL on insert).
  const db0 = requireDb();
  const promptOverride = await db0
    .select({ customPrompt: orgAiAgentConfig.customPrompt })
    .from(orgAiAgentConfig)
    .where(
      and(
        eq(orgAiAgentConfig.organizationId, orgId),
        eq(orgAiAgentConfig.agentKey, agentKey),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  const effectivePrompt =
    promptOverride?.customPrompt && promptOverride.customPrompt.trim().length > 0
      ? promptOverride.customPrompt
      : config.kickoffPrompt;
  const usingOverride = effectivePrompt !== config.kickoffPrompt;

  const exec = await aiExecute({
    organizationId: orgId,
    assistantKey: agentKey,
    triggeredByUserId: me.id,
    inputSummary: usingOverride
      ? `Run-now: ${config.label} (custom prompt)`
      : `Run-now: ${config.label}`,
    messages: [
      {
        role: "user",
        content: effectivePrompt,
      },
    ],
    maxTokens: 600,
    temperature: 0.3,
    timeoutMs: 30_000,
  });

  if (!exec.ok) {
    return {
      ok: false,
      error: exec.message,
    };
  }

  const db = requireDb();
  const outputCode = generateOutputCode(agentKey);
  const summary = exec.response.content.slice(0, 4000);

  const [row] = await db
    .insert(agentOutputs)
    .values({
      // HF-5: organization_id is NOT NULL on agent_outputs (migration 0072).
      organizationId: orgId,
      outputCode,
      agentKey,
      outputCategory: "snapshot",
      title: `${config.label} — manual snapshot`,
      summary,
      detailedOutput: {
        prompt: effectivePrompt,
        promptIsCustomOverride: usingOverride,
        canonicalPrompt: usingOverride ? config.kickoffPrompt : null,
        response: exec.response.content,
        usage: exec.response.usage,
        model: exec.response.model,
        runId: exec.runId,
        triggeredBy: me.id,
        triggeredAt: new Date().toISOString(),
      },
      recommendedActions: [],
      confidenceLevel: "medium",
      reasoningSummary: `Manually triggered via Run-now button on ${new Date().toISOString()}.${usingOverride ? " Used per-org custom prompt override." : ""}`,
      status: "awaiting_review",
    })
    .returning({ id: agentOutputs.id, outputCode: agentOutputs.outputCode });

  revalidatePath(`/development-os/ai-agents/${config.slug}`);
  revalidatePath("/development-os/ai-agents/inbox");

  return {
    ok: true,
    outputCode: row.outputCode,
    runId: exec.runId,
    agentSlug: config.slug,
  };
}
