/**
 * Phase 2.4 mgmt-02 — Pricing rules evaluator.
 *
 * Applies a priority-ordered stack of rules to an engine input.
 * Returns the per-step contributions so the UI can render the
 * rule rail with "+5%" / "−2%" deltas inline.
 *
 * Rule kinds:
 *   event       — date-range tag (e.g. "Nyepi", "Christmas") lift
 *   occupancy   — when remaining inventory < threshold, apply lift
 *   dow         — weekday vs weekend factor
 *   season      — season-band multiplier
 *   floor       — minimum cell amount
 *   ceiling     — maximum cell amount
 */

export type PricingRuleKind = "event" | "occupancy" | "dow" | "season" | "floor" | "ceiling";

export interface PricingRuleConditionEvent {
  startDate: string;
  endDate: string;
  tag: string;
}
export interface PricingRuleConditionOccupancy {
  /** Threshold 0..1. If remaining inventory < threshold, apply. */
  lessThanPct: number;
}
export interface PricingRuleConditionDow {
  /** ISO Mon=1 .. Sun=7. */
  daysOfWeek: number[];
}
export interface PricingRuleConditionSeason {
  startDate: string;
  endDate: string;
}
export type PricingRuleCondition =
  | { kind: "event"; data: PricingRuleConditionEvent }
  | { kind: "occupancy"; data: PricingRuleConditionOccupancy }
  | { kind: "dow"; data: PricingRuleConditionDow }
  | { kind: "season"; data: PricingRuleConditionSeason }
  | { kind: "always" };

export interface PricingRuleEffect {
  kind: "force" | "mul" | "add" | "floor" | "ceiling";
  value: number;
}

export interface PricingRule {
  id: string;
  villaId?: string | null;
  priority: number;
  kind: PricingRuleKind;
  condition: PricingRuleCondition;
  effect: PricingRuleEffect;
  enabled: boolean;
  pinned: boolean;
}

export interface RulesEvaluatorContext {
  date: string;
  villaId: string;
  remainingInventoryPct?: number;
}

export interface RuleApplication {
  rule: PricingRule;
  applied: boolean;
  before: number;
  after: number;
  reason: string;
}

function dowFromIso(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDay(); // Sun = 0
  return day === 0 ? 7 : day;
}

function ruleMatches(rule: PricingRule, ctx: RulesEvaluatorContext): boolean {
  if (!rule.enabled) return false;
  const c = rule.condition;
  if (c.kind === "always") return true;
  if (c.kind === "event") return ctx.date >= c.data.startDate && ctx.date <= c.data.endDate;
  if (c.kind === "season") return ctx.date >= c.data.startDate && ctx.date <= c.data.endDate;
  if (c.kind === "dow") return c.data.daysOfWeek.includes(dowFromIso(ctx.date));
  if (c.kind === "occupancy") {
    return ctx.remainingInventoryPct != null && ctx.remainingInventoryPct < c.data.lessThanPct;
  }
  return false;
}

function applyEffect(amount: number, effect: PricingRuleEffect): number {
  switch (effect.kind) {
    case "force":
      return effect.value;
    case "mul":
      return amount * effect.value;
    case "add":
      return amount + effect.value;
    case "floor":
      return Math.max(amount, effect.value);
    case "ceiling":
      return Math.min(amount, effect.value);
  }
}

export function evaluateRules(
  rules: PricingRule[],
  startAmount: number,
  ctx: RulesEvaluatorContext,
): { finalAmount: number; applications: RuleApplication[] } {
  let amount = startAmount;
  const applications: RuleApplication[] = [];
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    if (!ruleMatches(rule, ctx)) {
      applications.push({ rule, applied: false, before: amount, after: amount, reason: "condition unmet" });
      continue;
    }
    const before = amount;
    amount = applyEffect(amount, rule.effect);
    applications.push({
      rule,
      applied: true,
      before,
      after: amount,
      reason: `${rule.kind}/${rule.effect.kind}: ${rule.effect.value}`,
    });
  }
  return { finalAmount: amount, applications };
}
