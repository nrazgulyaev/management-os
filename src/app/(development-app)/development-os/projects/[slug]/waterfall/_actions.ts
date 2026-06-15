"use server";

/**
 * Wire-up — "use server" adapters for the server-only waterfall-rule
 * lifecycle actions. createWaterfallRule / updateWaterfallRuleParameters /
 * deactivateWaterfallRule already enforce requireInternalUser + org-scoping;
 * these wrappers only adapt the call shape to {ok}|{ok,error} and revalidate
 * the project's waterfall path. NO authority added.
 */

import { revalidatePath } from "next/cache";
import {
  createWaterfallRule,
  updateWaterfallRuleParameters,
  deactivateWaterfallRule,
} from "@/lib/development/server/waterfall/waterfall-actions";

type RuleType =
  | "generic_50_50"
  | "arconique_25_credit"
  | "preferred_return_then_split"
  | "waterfall_with_hurdle"
  | "capital_first_then_split"
  | "tiered_promote"
  | "custom";

type ActionResult = { ok: true } | { ok: false; error: string };

function rev(slug: string) {
  revalidatePath(`/development-os/projects/${slug}/waterfall`);
}

export async function createWaterfallRuleAction(input: {
  slug: string;
  projectId: string;
  ruleLabel: string;
  ruleType: RuleType;
  ruleParametersJson: string;
  description?: string | null;
  legalReference?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  try {
    let ruleParameters: Record<string, unknown> = {};
    const raw = (input.ruleParametersJson ?? "").trim();
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error("Parameters must be a JSON object.");
      }
      ruleParameters = parsed as Record<string, unknown>;
    }
    await createWaterfallRule({
      scope: "project",
      projectId: input.projectId,
      commitmentId: null,
      ruleLabel: input.ruleLabel,
      ruleType: input.ruleType,
      ruleParameters,
      description: input.description || null,
      legalReference: input.legalReference || null,
      notes: input.notes || null,
    });
    rev(input.slug);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Failed to create waterfall rule.",
    };
  }
}

export async function updateWaterfallRuleParametersAction(input: {
  slug: string;
  id: string;
  ruleParametersJson: string;
}): Promise<ActionResult> {
  try {
    const raw = (input.ruleParametersJson ?? "").trim();
    let ruleParameters: Record<string, unknown> = {};
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error("Parameters must be a JSON object.");
      }
      ruleParameters = parsed as Record<string, unknown>;
    }
    await updateWaterfallRuleParameters({ id: input.id, ruleParameters });
    rev(input.slug);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Failed to update rule parameters.",
    };
  }
}

export async function deactivateWaterfallRuleAction(input: {
  slug: string;
  id: string;
}): Promise<ActionResult> {
  try {
    await deactivateWaterfallRule({ id: input.id });
    rev(input.slug);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Failed to deactivate rule.",
    };
  }
}
