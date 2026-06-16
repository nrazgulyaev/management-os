/**
 * Phase 2.4 mgmt-02 — Dynamic-pricing cabinet data fns.
 *
 * Exposed to routes:
 *   getPricingSeries(villaId, days)       — algo + active + LY + comp
 *   getActiveOverrides(villaId)           — pinned overrides for the curve
 *   getPricingRules(villaId)              — sorted by priority
 *   getPricingEvents()                    — calendar markers (org-wide)
 *   upsertOverride(villaId, date, value)  — pinned override write
 *
 * Today returns stubs.
 */

import "server-only";
import type { PricingRule } from "@/features/pricing/rules-evaluator";
import type {
  PricingCurveOverride,
  PricingCurveSeries,
  PricingCurveEvent,
} from "@/components/pricing/pricing-curve-shared";

export async function getPricingSeries(villaId: string, days: number): Promise<PricingCurveSeries> {
  void villaId;
  void days;
  return { algo: [], active: [], lastYear: [], compMedian: [] };
}

export async function getActiveOverrides(villaId: string): Promise<PricingCurveOverride[]> {
  void villaId;
  return [];
}

export async function getPricingRules(villaId: string | null): Promise<PricingRule[]> {
  void villaId;
  return [];
}

export async function getPricingEvents(): Promise<PricingCurveEvent[]> {
  return [];
}

export interface UpsertOverrideInput {
  villaId: string;
  date: string;
  value: number;
  pinned: boolean;
  actorUserId: string;
}

export async function upsertOverride(_input: UpsertOverrideInput): Promise<{ ok: boolean }> {
  return { ok: true };
}
