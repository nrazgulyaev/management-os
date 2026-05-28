/**
 * Phase 2.4 mgmt-03 — vip-prep agent (stub).
 *
 * 24h before arrival, compiles a VIP brief from the guest's prior
 * stays: room preferences, dietary notes, recurring requests, last
 * concierge thread. Output appears on the front-office GuestCard
 * footer + the check-in stay-details step.
 */

export interface VipPrepInput {
  organizationId: string;
  bookingId: string;
}

export interface VipPrepOutput {
  brief: string;
  preferences: { key: string; value: string }[];
  /** Past concierge interactions worth flagging. */
  highlights: { at: string; summary: string }[];
}

export async function run(_input: VipPrepInput): Promise<VipPrepOutput> {
  return { brief: "", preferences: [], highlights: [] };
}

export const VIP_PREP_AGENT = {
  agentCode: "vip-prep",
  description: "Compiles VIP arrival brief 24h before check-in.",
} as const;
