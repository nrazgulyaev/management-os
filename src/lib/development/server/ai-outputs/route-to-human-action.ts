"use server";
import "server-only";

/**
 * AI-agents cabinet — "route to human" hand-off.
 *
 * When an operator routes a low-confidence agent reply to a named human,
 * the Acknowledge button used to be a no-op (setRoutedOperator(null)).
 * This action persists the hand-off as an agent_outputs row in the
 * review inbox (status="awaiting_review", category="handoff"), so the
 * routed operator actually has something to action.
 *
 * Org-scoped (requireOrgId + requireInternalUser) and audited.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";

const inputSchema = z.object({
  agentCode: z.string().min(2).max(120),
  routedTo: z.string().min(1).max(200),
  /** The agent reply / context being handed off. */
  context: z.string().max(8000).optional(),
});

function generateOutputCode(agentKey: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 13);
  return `${agentKey}_handoff_${ts}`;
}

export async function routeAgentReplyToHuman(
  input: z.input<typeof inputSchema>,
): Promise<{ ok: true; outputCode: string } | { ok: false; error: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };

  const agentKey = parsed.data.agentCode.replace(/-/g, "_");
  const outputCode = generateOutputCode(agentKey);
  const context = parsed.data.context?.trim() || "(no transcript captured)";

  const [row] = await db
    .insert(agentOutputs)
    .values({
      organizationId,
      outputCode,
      agentKey,
      outputCategory: "handoff",
      title: `Hand-off to ${parsed.data.routedTo}`,
      summary: `An agent reply was routed to ${parsed.data.routedTo} for human review.\n\n${context}`,
      detailedOutput: {
        kind: "route_to_human",
        routedTo: parsed.data.routedTo,
        agentCode: parsed.data.agentCode,
        context,
        routedBy: ctx.appUser?.id ?? null,
        routedAt: new Date().toISOString(),
      },
      recommendedActions: [`Follow up with ${parsed.data.routedTo}`],
      confidenceLevel: "low",
      reasoningSummary: `Routed to a human by the operator from the agent detail transcript.`,
      status: "awaiting_review",
    })
    .returning({ id: agentOutputs.id, outputCode: agentOutputs.outputCode });

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "agent_output.route_to_human",
    entityType: "agent_output",
    entityId: row.id,
    after: { routedTo: parsed.data.routedTo, agentCode: parsed.data.agentCode },
    metadata: { organizationId, outputCode, agentKey },
  });

  revalidatePath("/development-os/ai-agents/inbox");
  revalidatePath("/dashboard/ai/inbox");

  return { ok: true, outputCode: row.outputCode };
}
