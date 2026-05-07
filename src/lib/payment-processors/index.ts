/**
 * Stage 6.P3.A — Payment processors public surface.
 *
 * Importers should reach for this module rather than internal files
 * so the provider selector / type contract / DryRun fallback come
 * from one place. Per-provider implementations under `providers/`
 * are intentionally NOT re-exported — they're internal implementation
 * details accessed only via `selectPaymentProvider`.
 *
 * Note: this module covers the Stage 6.P3 unified processor surface
 * (Stripe, Wise Payments, PayPal, manual). The older direct-booking
 * deposit flow lives in `src/lib/payments/` and remains unchanged.
 */

export * from "./types";
export { selectPaymentProvider } from "./select-provider";
export { DryRunPaymentProvider } from "./providers/dry-run";
