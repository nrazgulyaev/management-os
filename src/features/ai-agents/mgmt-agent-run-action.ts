"use server";

/**
 * AI Cabinet depth pass — operator "Test run" + "New conversation" for
 * the Mgmt AI cabinet.
 *
 * The existing `runAgentAction` (Stage 8.B) only accepts the 7 Dev-OS
 * RUN_NOW_AGENTS keys and writes `agent_outputs` rows. The Mgmt cabinet
 * detail page uses hyphenated mgmt codes and wants a lightweight,
 * streaming-shaped chat/test surface that lands in `ai_assistant_runs`
 * (the table the /dashboard/ai/runs cabinet already reads).
 *
 * This action:
 *   1. permission-gates on `ai.run` + org-scopes via requireOrgId().
 *   2. resolves the mgmt code -> runtime assistant key.
 *   3. checks per-org eligibility (plan-tier × org override) for
 *      configurable agents so a paused agent fails fast.
 *   4. calls aiExecute() — which persists the run + bumps org usage +
 *      enforces the budget — and returns the reply + the run id so the
 *      caller can link to /dashboard/ai/runs/[id].
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { aiExecute } from "@/lib/ai/execute";
import { requirePermission } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
import { getAgentEligibility } from "./agent-config-actions";
import {
  assistantKeyForMgmtCode,
  isConfigurableAgent,
} from "./agent-detail-queries";

const inputSchema = z.object({
  agentCode: z.string().min(1).max(80),
  prompt: z.string().min(1).max(4000),
  /** "test" = canonical operator probe; "chat" = New conversation turn. */
  mode: z.enum(["test", "chat"]).default("test"),
});

export type MgmtAgentRunResult =
  | {
      ok: true;
      runId: string;
      reply: string;
      model: string | null;
      totalTokens: number | null;
      latencyMs: number | null;
    }
  | { ok: false; error: string };

export async function runMgmtAgentAction(
  input: z.input<typeof inputSchema>,
): Promise<MgmtAgentRunResult> {
  await requirePermission("ai.run");

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return { ok: false, error: "No organization context available." };
  }

  const assistantKey = assistantKeyForMgmtCode(parsed.data.agentCode);

  // Eligibility only applies to configurable agents; system surfaces
  // (inbox/memory) and unmapped codes skip the per-org gate but still
  // run through aiExecute's plan + budget enforcement.
  if (isConfigurableAgent(assistantKey)) {
    const elig = await getAgentEligibility(orgId, assistantKey);
    if (!elig.eligible) {
      const message =
        elig.reason === "no_subscription"
          ? "Your workspace has no active subscription."
          : elig.reason === "plan_excludes_agent"
            ? "This agent is not included in your current plan."
            : elig.reason === "disabled_by_org"
              ? "This agent is paused for your workspace. Resume it to run."
              : "This agent is not available right now.";
      return { ok: false, error: message };
    }
  }

  const exec = await aiExecute({
    organizationId: orgId,
    assistantKey,
    triggeredByUserId: me.id,
    inputSummary:
      parsed.data.mode === "chat"
        ? `Chat: ${parsed.data.prompt.slice(0, 120)}`
        : `Test run: ${parsed.data.agentCode}`,
    messages: [{ role: "user", content: parsed.data.prompt }],
    maxTokens: 600,
    temperature: 0.3,
    timeoutMs: 30_000,
  });

  if (!exec.ok) {
    return { ok: false, error: exec.message };
  }

  revalidatePath("/dashboard/ai/runs");
  revalidatePath(`/dashboard/ai/${parsed.data.agentCode}`);

  return {
    ok: true,
    runId: exec.runId,
    reply: exec.response.content,
    model: exec.response.model,
    totalTokens: exec.response.usage.totalTokens,
    latencyMs: null,
  };
}
