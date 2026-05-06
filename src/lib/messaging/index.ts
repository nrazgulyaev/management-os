/**
 * Stage 6.P2 — Messaging public surface.
 *
 * Importers should reach for this module rather than internal files
 * so the provider selector / type contract / DryRun fallback come
 * from one place. Per-channel implementations under `providers/` are
 * intentionally NOT re-exported — they're internal implementation
 * details accessed only via `selectMessagingProvider`.
 */

export * from "./types";
export { selectMessagingProvider } from "./select-provider";
export { DryRunMessagingProvider } from "./providers/dry-run";
