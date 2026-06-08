"use server";

/**
 * Wire-up sweep — "use server" adapters for the server-only safety
 * incident mutations so the per-row controls can call them.
 */

import {
  setSafetyIncidentStatus,
  resolveSafetyIncident,
} from "@/lib/development/server/safety-actions";
import type { SafetyStatus } from "@/lib/development/constants/safety-constants";

export async function setSafetyStatusAction(
  id: string,
  status: SafetyStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await setSafetyIncidentStatus(id, status);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function resolveSafetyAction(
  id: string,
  resolutionNotes: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await resolveSafetyIncident(id, resolutionNotes);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}
