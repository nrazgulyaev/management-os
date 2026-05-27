/**
 * Phase 2.1 PR 3 — minimal telemetry shim.
 *
 * Centralizes event emission so feature code never reaches for
 * `console.log` or a vendor SDK directly. Today this just logs to
 * the console in dev and no-ops in production; future PRs swap the
 * backend (Vercel Web Analytics custom events, PostHog, etc) by
 * editing this single file.
 *
 * Naming convention: `{surface}_{verb}` snake-case
 * (e.g. `command_palette_opened`, `modal_dirty_discard`).
 */

export type TelemetryEvent =
  | "command_palette_opened"
  | "command_palette_action_chosen"
  | "modal_opened"
  | "modal_dirty_discard"
  | (string & {}); // allow ad-hoc events without losing autocomplete

export type TelemetryProps = Record<string, string | number | boolean | null | undefined>;

let consumer: ((event: string, props: TelemetryProps) => void) | null = null;

/** Register a real telemetry sink (e.g. a PostHog client) once at
 *  app boot. Multiple calls overwrite; pass `null` to detach. */
export function setTelemetryConsumer(
  fn: ((event: string, props: TelemetryProps) => void) | null,
) {
  consumer = fn;
}

export function emit(event: TelemetryEvent, props: TelemetryProps = {}) {
  if (consumer) {
    try {
      consumer(event, props);
    } catch (err) {
      // Never let telemetry crash the host page.
      if (process.env.NODE_ENV !== "production") {
        console.warn("[telemetry] consumer threw", err);
      }
    }
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    // dev-only console echo — lets primitives demonstrate they fire.
    console.debug(`[telemetry] ${event}`, props);
  }
}
