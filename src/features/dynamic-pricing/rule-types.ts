/**
 * Pure rule-shape types for the dynamic pricing engine.
 * No DB / no `server-only` import. The DB schema rows are mapped onto
 * these shapes by `services.ts` so the engine can run on synthetic
 * test data identical to production.
 */

export type ScopeType = "global" | "project" | "villa";
export type RuleStatus = "active" | "paused" | "archived";
export type ModifierType = "percent" | "fixed";
export type CloseOutModifierType = "percent" | "fixed" | "stop_sell";

export interface RuleSet {
  id: string;
  ruleSetCode: string;
  name: string;
  scopeType: ScopeType;
  projectId: string | null;
  villaId: string | null;
  status: RuleStatus;
  priority: number;
  currency: string;
  baseRateMinor: bigint;
  minRateMinor: bigint | null;
  maxRateMinor: bigint | null;
}

export interface DayOfWeekRule {
  id: string;
  ruleSetId: string;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  modifierType: ModifierType;
  modifierValueNumeric: number | null;
  modifierAmountMinor: bigint | null;
  minLos: number | null;
  status: RuleStatus;
}

export interface OccupancyRule {
  id: string;
  ruleSetId: string;
  occupancyMin: number;
  occupancyMax: number;
  modifierType: ModifierType;
  modifierValueNumeric: number | null;
  modifierAmountMinor: bigint | null;
  status: RuleStatus;
}

export interface CloseOutRule {
  id: string;
  ruleSetId: string;
  daysBeforeCheckinMin: number;
  daysBeforeCheckinMax: number;
  modifierType: CloseOutModifierType;
  modifierValueNumeric: number | null;
  modifierAmountMinor: bigint | null;
  minLos: number | null;
  status: RuleStatus;
}

export interface ChannelRule {
  id: string;
  ruleSetId: string;
  channelKey: string;
  modifierType: ModifierType;
  modifierValueNumeric: number | null;
  modifierAmountMinor: bigint | null;
  commissionModel: string | null;
  status: RuleStatus;
}

export interface MinStayRule {
  id: string;
  ruleSetId: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  /** Subset of weekdays 1..7 the rule applies to. Empty / null means
   *  every weekday. */
  weekdayMask: number[] | null;
  minLos: number;
  maxLos: number | null;
  priority: number;
  status: RuleStatus;
}

export interface StopSellRule {
  id: string;
  ruleSetId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  reason: string;
  channelKey: string | null;
  status: RuleStatus;
}

export interface ManualBlockRule {
  /** Half-open `[startsAt, endsAt)`. */
  startsOn: string;
  endsOn: string;
  reason: string;
}

export interface RuleBundle {
  ruleSet: RuleSet;
  dayOfWeek: DayOfWeekRule[];
  occupancy: OccupancyRule[];
  closeOut: CloseOutRule[];
  channels: ChannelRule[];
  minStay: MinStayRule[];
  stopSell: StopSellRule[];
}

/** Pure: convenience to identify active rules quickly. */
export function isActive<T extends { status: RuleStatus }>(r: T): boolean {
  return r.status === "active";
}
