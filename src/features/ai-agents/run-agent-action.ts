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

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";
import { aiExecute } from "@/lib/ai/execute";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
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

  // Stage 7.E tenant subdomain not yet wired through — fall back to
  // ARCONIQUE_DEFAULT (same compromise other dev-os actions use).
  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) {
    return { ok: false, error: "No organization context available." };
  }

  const exec = await aiExecute({
    organizationId: org.id,
    assistantKey: agentKey,
    triggeredByUserId: me.id,
    inputSummary: `Run-now: ${config.label}`,
    messages: [
      {
        role: "user",
        content: config.kickoffPrompt,
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
      outputCode,
      agentKey,
      outputCategory: "snapshot",
      title: `${config.label} — manual snapshot`,
      summary,
      detailedOutput: {
        prompt: config.kickoffPrompt,
        response: exec.response.content,
        usage: exec.response.usage,
        model: exec.response.model,
        runId: exec.runId,
        triggeredBy: me.id,
        triggeredAt: new Date().toISOString(),
      },
      recommendedActions: [],
      confidenceLevel: "medium",
      reasoningSummary: `Manually triggered via Run-now button on ${new Date().toISOString()}.`,
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
