/**
 * Phase 2.4 mgmt-01 — Channel rate-cell state machine.
 *
 * 6 states for a (villa, channel, date) cell:
 *   pending  → never pushed, or push in-flight
 *   synced   → channel acked our value AND value matches
 *   stale    → no push in STALE_AFTER_MS
 *   conflict → channel returns a different value than we pushed
 *   blocked  → manually blocked by ops (no inventory)
 *   booked   → a stay holds the cell (cannot edit)
 *
 * Transitions are pure functions for unit-testability. The
 * conflict-resolver (see ./conflict-resolver.ts) is invoked by ops
 * to clear a conflict.
 */

export type CellSyncState = "pending" | "synced" | "stale" | "conflict" | "blocked" | "booked";

export type CellSyncEvent =
  | { kind: "push-attempt" }
  | { kind: "push-ack"; ackedValue: number; pushedValue: number }
  | { kind: "tick"; sinceLastPushMs: number }
  | { kind: "block" }
  | { kind: "unblock" }
  | { kind: "booking-created" }
  | { kind: "booking-cancelled" }
  | { kind: "resolved" };

export const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

export function transition(state: CellSyncState, event: CellSyncEvent): CellSyncState {
  // Terminal-ish states require explicit transitions.
  if (state === "booked") {
    return event.kind === "booking-cancelled" ? "synced" : "booked";
  }
  if (state === "blocked") {
    return event.kind === "unblock" ? "synced" : "blocked";
  }

  switch (event.kind) {
    case "push-attempt":
      return "pending";
    case "push-ack":
      return event.ackedValue === event.pushedValue ? "synced" : "conflict";
    case "tick":
      if (state === "synced" && event.sinceLastPushMs > STALE_AFTER_MS) return "stale";
      return state;
    case "block":
      return "blocked";
    case "booking-created":
      return "booked";
    case "resolved":
      return "synced";
    default:
      return state;
  }
}

export interface CellAction {
  id: string;
  label: string;
  intent: "primary" | "secondary" | "destructive";
}

export type CellActorRole = "ops" | "director" | "viewer";

export function getNextActions(state: CellSyncState, role: CellActorRole): CellAction[] {
  if (role === "viewer") return [];
  switch (state) {
    case "pending":
      return [{ id: "retry-push", label: "Retry push", intent: "secondary" }];
    case "stale":
      return [{ id: "force-push", label: "Force push", intent: "primary" }];
    case "conflict":
      return [
        { id: "accept-channel", label: "Accept channel value", intent: "secondary" },
        { id: "force-ours", label: "Force our value", intent: "primary" },
        { id: "flag-and-pause", label: "Flag & pause", intent: "destructive" },
      ];
    case "blocked":
      return role === "director" ? [{ id: "unblock", label: "Unblock", intent: "secondary" }] : [];
    case "booked":
      return role === "director" ? [{ id: "cancel-booking", label: "Cancel booking", intent: "destructive" }] : [];
    case "synced":
    default:
      return [{ id: "edit", label: "Edit rate", intent: "secondary" }];
  }
}
