"use server";

/**
 * UI adapters for decision lifecycle controls. The underlying actions are
 * already "use server" + org-scoped + audited; these wrappers add per-slug
 * revalidation and a uniform result shape for the client island.
 */

import { revalidatePath } from "next/cache";
import {
  reverseProjectDecision,
  supersedeProjectDecision,
} from "@/lib/development/server/decisions/decision-actions";

export async function reverseProjectDecisionAction(input: {
  decisionId: string;
  slug: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await reverseProjectDecision({ decisionId: input.decisionId });
    revalidatePath(
      `/development-os/projects/${input.slug}/decisions/${input.code}`,
    );
    revalidatePath(`/development-os/projects/${input.slug}/decisions`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to reverse decision.",
    };
  }
}

export async function supersedeProjectDecisionAction(input: {
  oldDecisionId: string;
  projectId: string;
  slug: string;
  title: string;
  decisionText: string;
  rationale?: string;
  context?: string;
  category?: string;
}): Promise<
  | { ok: true; newCode: string }
  | { ok: false; error: string }
> {
  try {
    const { new: created } = await supersedeProjectDecision({
      oldDecisionId: input.oldDecisionId,
      newDecisionInput: {
        title: input.title,
        projectId: input.projectId,
        decisionText: input.decisionText,
        rationale: input.rationale?.trim() || null,
        context: input.context?.trim() || null,
        category: input.category?.trim() || null,
      },
    });
    revalidatePath(`/development-os/projects/${input.slug}/decisions`);
    return { ok: true, newCode: created.decisionCode };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to supersede decision.",
    };
  }
}
