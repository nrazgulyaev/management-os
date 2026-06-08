/**
 * Phase 2.4 mgmt-03 — Front-office cabinet data fns.
 *
 * Surfaces:
 *   getTodayBoard          — arrivals + in-house + departures + KPIs
 *   getCheckinFlowState    — bookmark for a paused 4-step flow
 *   getRegistry            — ID + visa registry rows
 *   getTurnovers           — live turnover monitor rows
 *
 * Today returns empty / stubbed.
 */

import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookingCheckinFlow } from "@/lib/db/schema/checkin-flow";
import type { GuestCardFlavour } from "@/components/front-office/guest-card";
import type { CheckinFlowState, CheckinStep, CheckinStepState } from "./checkin-state";
import type { RegistryRow } from "@/components/front-office/registry-table";
import type { TurnoverRow } from "@/components/front-office/turnover-monitor";

export interface TodayBoardBooking {
  bookingId: string;
  villaCode: string;
  guestName: string;
  partySize: number;
  nights: number;
  windowLabel: string;
  flavour: GuestCardFlavour;
  badge?: string;
  nextAction?: string;
  href: string;
}

export interface TodayBoardResult {
  date: string;
  arrivals: TodayBoardBooking[];
  inHouse: TodayBoardBooking[];
  departures: TodayBoardBooking[];
  kpis: { label: string; value: string; tone?: "ok" | "warn" | "danger" }[];
}

export async function getTodayBoard(): Promise<TodayBoardResult> {
  return {
    date: new Date().toISOString().slice(0, 10),
    arrivals: [],
    inHouse: [],
    departures: [],
    kpis: [],
  };
}

function freshFlowState(bookingId: string): CheckinFlowState {
  return {
    bookingId,
    currentStep: "identity",
    steps: {
      identity: { step: "identity" },
      stay: { step: "stay" },
      sign: { step: "sign" },
      handover: { step: "handover" },
    },
  };
}

/**
 * Load a booking's persisted check-in flow (migration 0123). Returns the
 * stored steps + current step + issued door code when one exists; otherwise a
 * fresh state so the wizard starts at identity.
 */
export async function getCheckinFlowState(bookingId: string): Promise<CheckinFlowState> {
  const db = getDb();
  if (!db) return freshFlowState(bookingId);
  const [row] = await db
    .select()
    .from(bookingCheckinFlow)
    .where(eq(bookingCheckinFlow.bookingId, bookingId))
    .limit(1);
  if (!row) return freshFlowState(bookingId);
  const fresh = freshFlowState(bookingId);
  const stored = (row.stepsJson ?? {}) as Partial<Record<CheckinStep, CheckinStepState>>;
  return {
    bookingId,
    currentStep: (row.currentStep as CheckinStep) ?? "identity",
    steps: {
      identity: stored.identity ?? fresh.steps.identity,
      stay: stored.stay ?? fresh.steps.stay,
      sign: stored.sign ?? fresh.steps.sign,
      handover: stored.handover ?? fresh.steps.handover,
    },
  };
}

/** The door code issued for a completed check-in, if any. */
export async function getIssuedDoorCode(bookingId: string): Promise<{
  doorCode: string | null;
  completedAt: Date | null;
} | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ doorCode: bookingCheckinFlow.doorCode, completedAt: bookingCheckinFlow.completedAt })
    .from(bookingCheckinFlow)
    .where(eq(bookingCheckinFlow.bookingId, bookingId))
    .limit(1);
  return row ?? null;
}

export async function getRegistry(): Promise<RegistryRow[]> {
  return [];
}

export async function getTurnovers(): Promise<TurnoverRow[]> {
  return [];
}
