"use server";

/**
 * Wire-up sweep — "use server" adapters for the server-only cashflow
 * actions (generate + transition), normalized to {ok,error} + revalidate.
 */

import { revalidatePath } from "next/cache";
import {
  generateCashflowForecast,
  transitionCashflowForecast,
} from "@/lib/development/server/cashflow/cashflow-actions";

const PATH = "/development-os/cashflow-forecast";

export interface GenerateForecastInput {
  forecastLabel: string;
  scope: "project" | "company_wide";
  projectId?: string | null;
  horizonMonths: number;
  startMonth: string;
  startingCash: number;
  monthlyPayrollCommitment: number;
  monthlyFixedCosts: number;
}

export async function generateForecastAction(
  input: GenerateForecastInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await generateCashflowForecast(input);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Generate failed." };
  }
}

export async function transitionForecastAction(
  forecastId: string,
  to: "draft" | "active" | "archived" | "superseded",
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await transitionCashflowForecast({ forecastId, to });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Transition failed." };
  }
}
