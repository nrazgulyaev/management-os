/**
 * Stage 6.P1 — Channel Manager public surface.
 *
 * Importers should reach for this module rather than internal files
 * so the provider selector / type contract / DryRun fallback come from
 * one place. Per-channel implementations under `providers/` are
 * intentionally NOT re-exported — they're internal implementation
 * details accessed only via `selectChannelProvider`.
 */

export * from "./types";
export { selectChannelProvider } from "./select-provider";
export { DryRunChannelProvider } from "./providers/dry-run";
