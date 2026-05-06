"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/features/auth/permissions";
import { generateOperationsCopilotSummary } from "./service";

export interface CopilotActionResult {
  ok: boolean;
  status?: string;
  fallbackUsed?: boolean;
  errorMessage?: string;
  latencyMs?: number;
}

/**
 * Manually refresh the Operations Co-pilot daily summary. Permission
 * gated by `ai.run` (operators + above). Always succeeds in returning
 * *some* summary — when AI is disabled or errors out, the deterministic
 * fallback is persisted instead.
 */
export async function refreshOperationsCopilotSummaryAction(): Promise<CopilotActionResult> {
  await requirePermission("ai.run");
  const out = await generateOperationsCopilotSummary({ triggerType: "manual" });
  // Re-render the operations dashboard + AI surfaces.
  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/ai");
  revalidatePath("/dashboard/ai/operations");
  revalidatePath("/dashboard/ai/runs");
  return {
    ok: true,
    status: out.status,
    fallbackUsed: out.fallbackUsed,
    errorMessage: out.errorMessage,
    latencyMs: out.latencyMs,
  };
}
