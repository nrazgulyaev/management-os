/**
 * Phase 2.4 mgmt-01 — Channel conflict resolver.
 *
 * Pure functions that turn a 3-way conflict resolution into an
 * audit payload + a follow-up action (retry push, open ticket).
 *
 * The actual DB write happens server-side; this module is the
 * domain logic that the conflict modal calls into.
 */

import type { CellSyncState } from "./state-machine";

export type ConflictResolution = "accept-channel" | "force-ours" | "flag-and-pause";

export interface ConflictInput {
  villaId: string;
  channelId: string;
  date: string;
  ourValue: number;
  channelValue: number;
  resolution: ConflictResolution;
  actorUserId: string;
  /** Optional free-text justification (required for flag-and-pause). */
  note?: string;
}

export interface ConflictAuditPayload {
  kind: "conflict-resolution";
  villaId: string;
  channelId: string;
  date: string;
  resolution: ConflictResolution;
  ourValue: number;
  channelValue: number;
  appliedValue: number;
  actorUserId: string;
  note?: string;
  at: string;
}

export interface ConflictFollowup {
  /** Next state the cell should be put into. */
  nextState: CellSyncState;
  /** Side-effect — what the caller must enqueue. */
  sideEffect:
    | { kind: "retry-push"; amount: number }
    | { kind: "open-ticket"; severity: "warn" | "p1"; summary: string }
    | { kind: "none" };
}

export function resolveConflict(input: ConflictInput): {
  audit: ConflictAuditPayload;
  followup: ConflictFollowup;
} {
  const appliedValue = input.resolution === "accept-channel" ? input.channelValue : input.ourValue;

  const audit: ConflictAuditPayload = {
    kind: "conflict-resolution",
    villaId: input.villaId,
    channelId: input.channelId,
    date: input.date,
    resolution: input.resolution,
    ourValue: input.ourValue,
    channelValue: input.channelValue,
    appliedValue,
    actorUserId: input.actorUserId,
    note: input.note,
    at: new Date().toISOString(),
  };

  let followup: ConflictFollowup;
  switch (input.resolution) {
    case "accept-channel":
      followup = { nextState: "synced", sideEffect: { kind: "none" } };
      break;
    case "force-ours":
      followup = { nextState: "pending", sideEffect: { kind: "retry-push", amount: input.ourValue } };
      break;
    case "flag-and-pause":
      followup = {
        nextState: "blocked",
        sideEffect: {
          kind: "open-ticket",
          severity: "p1",
          summary: `Channel ${input.channelId} drifted on ${input.villaId} for ${input.date}: ours=${input.ourValue}, theirs=${input.channelValue}`,
        },
      };
      break;
  }

  return { audit, followup };
}
