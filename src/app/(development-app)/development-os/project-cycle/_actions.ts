"use server";

/**
 * Wire-up sweep — "use server" adapter for the server-only
 * reviewCycleRecommendation action so the client review buttons can call
 * it. Normalizes to an {ok,error} result.
 */

import { reviewCycleRecommendation } from "@/lib/development/server/project-cycle/cycle-actions";

export async function reviewCycleRecommendationAction(input: {
  recommendationId: string;
  decision: "reviewed" | "accepted" | "rejected" | "partially_accepted";
  operatorNotes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await reviewCycleRecommendation(input);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Review failed." };
  }
}
