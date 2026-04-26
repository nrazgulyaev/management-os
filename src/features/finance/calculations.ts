import { calculateAdrMinor, calculateRevparMinor, calculateNights } from "@/lib/money";

export interface BookingFinanceFacts {
  checkIn: string;
  checkOut: string;
  grossAmountMinor: bigint;
  cleaningFeeMinor: bigint;
}

export function nightsForBooking(b: { checkIn: string; checkOut: string }): number {
  return calculateNights(b.checkIn, b.checkOut);
}

/**
 * Total nights in a date range, inclusive of the start, exclusive of the end.
 */
export function nightsInRange(periodStart: string, periodEnd: string): number {
  return calculateNights(periodStart, addOneDay(periodEnd));
}

/** Add one day to an ISO date string. Used to make range calculations inclusive. */
export function addOneDay(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function clampInteger(input: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(input)));
}

export interface OccupancyInputs {
  villaCount: number;
  periodStart: string;
  periodEnd: string;
  soldNights: number;
}

/** Returns occupancy as a 0–1 fraction. */
export function calculateOccupancy(inputs: OccupancyInputs): number {
  const totalAvailable = inputs.villaCount * nightsInRange(inputs.periodStart, inputs.periodEnd);
  if (totalAvailable <= 0) return 0;
  return inputs.soldNights / totalAvailable;
}

export interface RoomMetrics {
  occupancy: number;
  adrMinor: bigint;
  revparMinor: bigint;
  soldNights: number;
  availableNights: number;
}

export function calculateRoomMetrics(
  villaCount: number,
  periodStart: string,
  periodEnd: string,
  soldNights: number,
  grossRevenueMinor: bigint,
): RoomMetrics {
  const availableNights = villaCount * nightsInRange(periodStart, periodEnd);
  return {
    occupancy: availableNights > 0 ? soldNights / availableNights : 0,
    adrMinor: calculateAdrMinor(grossRevenueMinor, soldNights),
    revparMinor: calculateRevparMinor(grossRevenueMinor, availableNights),
    soldNights,
    availableNights,
  };
}
