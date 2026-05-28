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
import type { GuestCardFlavour } from "@/components/front-office/guest-card";
import type { CheckinFlowState } from "./checkin-state";
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

export async function getCheckinFlowState(bookingId: string): Promise<CheckinFlowState> {
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

export async function getRegistry(): Promise<RegistryRow[]> {
  return [];
}

export async function getTurnovers(): Promise<TurnoverRow[]> {
  return [];
}
