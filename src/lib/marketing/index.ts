/**
 * Stage 6.P4.A — Marketing public surface.
 *
 * Importers should reach for this module rather than internal files
 * so the provider selector / type contract / DryRun fallback come
 * from one place. Per-provider implementations under `providers/`
 * are intentionally NOT re-exported — they're internal implementation
 * details accessed only via `selectMarketingProvider`.
 */

export * from "./types";
export { selectMarketingProvider } from "./select-provider";
export { DryRunMarketingProvider } from "./providers/dry-run";
