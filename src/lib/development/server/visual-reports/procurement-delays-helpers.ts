/**
 * Stage 5.C — Procurement delay metrics.
 *
 * Pure helpers — no I/O.
 */

export interface SupplierDelayInput {
  supplierId: string;
  supplierName: string;
  /** All deliveries by this supplier in window. */
  deliveries: Array<{
    expectedAt: Date;
    actualAt: Date | null;
  }>;
}

export interface SupplierDelayMetrics {
  supplierId: string;
  supplierName: string;
  totalDeliveries: number;
  lateDeliveries: number;
  onTimePct: number;
  /** Average lead-time delay (days). Negative = early. NaN if no completed. */
  avgDelayDays: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function computeSupplierDelays(
  inputs: SupplierDelayInput[],
): SupplierDelayMetrics[] {
  return inputs.map((s) => {
    const total = s.deliveries.length;
    const completed = s.deliveries.filter((d) => d.actualAt != null);
    const late = completed.filter(
      (d) => (d.actualAt as Date).getTime() > d.expectedAt.getTime(),
    ).length;
    const delays = completed.map(
      (d) =>
        ((d.actualAt as Date).getTime() - d.expectedAt.getTime()) / DAY,
    );
    const avgDelay =
      delays.length > 0
        ? delays.reduce((a, b) => a + b, 0) / delays.length
        : NaN;
    const onTimePct =
      completed.length > 0
        ? ((completed.length - late) / completed.length) * 100
        : 0;
    return {
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      totalDeliveries: total,
      lateDeliveries: late,
      onTimePct,
      avgDelayDays: avgDelay,
    };
  });
}

/** Sort suppliers by performance (best first). */
export function rankSuppliers(
  metrics: SupplierDelayMetrics[],
): SupplierDelayMetrics[] {
  return [...metrics].sort((a, b) => {
    if (b.onTimePct !== a.onTimePct) return b.onTimePct - a.onTimePct;
    const aD = Number.isNaN(a.avgDelayDays) ? 0 : a.avgDelayDays;
    const bD = Number.isNaN(b.avgDelayDays) ? 0 : b.avgDelayDays;
    return aD - bD;
  });
}
