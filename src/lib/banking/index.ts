/**
 * Stage 6.P3.A — Banking public surface.
 *
 * Importers should reach for this module rather than internal files
 * so the provider selector / type contract / DryRun fallback come
 * from one place. Per-provider implementations under `providers/`
 * are intentionally NOT re-exported — they're internal implementation
 * details accessed only via `selectBankProvider`.
 */

export * from "./types";
export { selectBankProvider } from "./select-provider";
export { DryRunBankProvider } from "./providers/dry-run";
