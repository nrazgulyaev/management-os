/**
 * CRM ACTIVITY TIMELINE — composer shared vocabulary (sync helpers).
 *
 * Kept in a NON-"use server" module so it can export sync constants, types and
 * pure functions consumed by BOTH the write action (./actions.ts) and the
 * client composer (<LogActivityComposer>). (BUILD-SAFETY #168: a "use server"
 * file may export ONLY async functions.)
 *
 * The composer deliberately offers a NARROW kind set — the human touchpoints an
 * operator logs by hand. Automatic kinds (status_change, message, task) are
 * still written by their owning surfaces, never typed in here.
 */

import type { CrmActivityKind, CrmSubjectType } from "./types";

/** The kinds an operator can manually log. */
export type ComposerKind = Extract<CrmActivityKind, "note" | "call" | "email">;

export const COMPOSER_KINDS: readonly ComposerKind[] = [
  "note",
  "call",
  "email",
] as const;

export const COMPOSER_KIND_LABEL: Record<ComposerKind, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
};

export function isComposerKind(v: unknown): v is ComposerKind {
  return typeof v === "string" && (COMPOSER_KINDS as readonly string[]).includes(v);
}

/**
 * Deep-link to the detail route the activity hangs off, for revalidation.
 * Returns null when the subject has no id-keyed detail page (e.g. buyers are
 * routed by code, not id — the client refresh covers that surface instead).
 */
export function activitySubjectHref(
  subjectType: CrmSubjectType,
  subjectId: string,
): string | null {
  switch (subjectType) {
    case "owner":
      return `/dashboard/owners/${subjectId}`;
    default:
      return null;
  }
}
