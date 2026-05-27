/**
 * Phase 2.2 mgmt-03 — onboarding-doc-checker agent (stub).
 *
 * Validates the ID upload on step 1 of OnboardOwnerModal. Checks
 * legibility, MRZ + name match against the typed fields, and
 * surfaces a confidence score. Director can override.
 */

export interface DocCheckerInput {
  organizationId: string;
  docUrl: string;
  /** Owner name as typed in the modal — used for name-match. */
  expectedName: string;
}

export interface DocCheckerOutput {
  legible: boolean;
  /** 0..100. */
  nameMatchConfidence: number;
  /** ISO YYYY-MM-DD or null if not parseable. */
  expiry: string | null;
  /** Free-form note (e.g. "Passport, machine-readable zone parsed"). */
  note: string;
}

export async function run(_input: DocCheckerInput): Promise<DocCheckerOutput> {
  return {
    legible: true,
    nameMatchConfidence: 0,
    expiry: null,
    note: "Stub — real OCR + name match wires in 2.2 data.",
  };
}

export const DOC_CHECKER_AGENT = {
  agentCode: "onboarding-doc-checker",
  description: "Validates ID upload on owner onboarding step 1; surfaces legibility + name-match + expiry.",
} as const;
