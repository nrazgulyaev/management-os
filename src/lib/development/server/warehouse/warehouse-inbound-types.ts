/**
 * Result types for the warehouse inbound actions. Kept in a plain module
 * (not the `"use server"` action files) so those files export ONLY async
 * functions, per the build-safety rule.
 */

export interface ReceivePoResult {
  poId: string;
  poCode: string;
  status: string;
  /** Lines whose QC passed and produced a stock movement. */
  movementsWritten: number;
  /** Lines that passed QC but had no inventory SKU match (delivery bumped,
   * no stock movement). */
  unmatchedPassed: number;
}

export interface CycleCountResult {
  movementId: string | null;
  movementCode: string | null;
  previousOnHand: number;
  countedQuantity: number;
  variance: number;
  /** true when count == on-hand (no movement written). */
  noChange: boolean;
}
