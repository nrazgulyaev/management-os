/**
 * Pure helpers for inventory counts. Variance computation lives here so it
 * stays testable without a DB.
 */

export interface CountLineSnapshot {
  itemId: string;
  expectedQuantity: number | null;
  countedQuantity: number;
}

export interface CountVariance {
  itemId: string;
  expected: number;
  counted: number;
  variance: number;
}

export function computeCountVariance(line: CountLineSnapshot): CountVariance {
  const expected = line.expectedQuantity ?? 0;
  return {
    itemId: line.itemId,
    expected,
    counted: line.countedQuantity,
    variance: line.countedQuantity - expected,
  };
}

export function totalAbsVariance(lines: CountLineSnapshot[]): number {
  return lines.reduce((acc, l) => acc + Math.abs(computeCountVariance(l).variance), 0);
}
