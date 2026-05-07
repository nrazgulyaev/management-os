/**
 * Stage 6.P3.G — Reconciliation rules engine.
 *
 * Pure helpers — no I/O. The service layer loads `reconciliation_rules`
 * for the org, runs each new bank transaction through `applyRules`,
 * and applies any non-conflicting actions (assign category, link to
 * vendor) before the auto-matcher runs.
 *
 * Rules fire in priority order (lower number = higher precedence);
 * the first matching rule per category-action wins.
 */

import type { ReconciliationMatchType } from "@/lib/db/schema/banking";

export interface RuleConfig {
  /** description_contains / description_regex / counterparty_match /
   *  amount_range / amount_exact / date_range_match */
  matchType: ReconciliationMatchType;
  /** Trigger config — shape varies by `matchType`. */
  matchConfig: Record<string, unknown>;
}

export interface RuleAction {
  autoAssignCategoryId?: string | null;
  autoMatchToVendorId?: string | null;
  /** When set, the auto-matcher restricts its candidate-invoice
   *  search by this strategy. */
  autoMatchToInvoiceStrategy?:
    | "amount_only"
    | "amount_and_date"
    | "amount_date_vendor"
    | "fuzzy_description"
    | null;
}

export interface ReconciliationRule extends RuleConfig, RuleAction {
  id: string;
  name: string;
  isActive: boolean;
  priority: number;
}

export interface ApplicableTransaction {
  amountMinor: bigint;
  description: string;
  counterpartyName?: string;
  transactionDate: Date;
}

export interface RuleApplication {
  appliedRuleIds: string[];
  suggestedCategoryId?: string;
  suggestedVendorId?: string;
  suggestedInvoiceStrategy?: RuleAction["autoMatchToInvoiceStrategy"];
}

/**
 * Run a transaction through every active rule in priority order.
 * For each match, apply its action — but only set a suggested field
 * once (first rule wins). Returns the cumulative application.
 */
export function applyRules(
  tx: ApplicableTransaction,
  rules: ReconciliationRule[],
): RuleApplication {
  const out: RuleApplication = { appliedRuleIds: [] };
  const sorted = [...rules]
    .filter((r) => r.isActive)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (!ruleMatches(tx, rule)) continue;
    out.appliedRuleIds.push(rule.id);
    if (!out.suggestedCategoryId && rule.autoAssignCategoryId) {
      out.suggestedCategoryId = rule.autoAssignCategoryId;
    }
    if (!out.suggestedVendorId && rule.autoMatchToVendorId) {
      out.suggestedVendorId = rule.autoMatchToVendorId;
    }
    if (
      !out.suggestedInvoiceStrategy &&
      rule.autoMatchToInvoiceStrategy
    ) {
      out.suggestedInvoiceStrategy = rule.autoMatchToInvoiceStrategy;
    }
  }
  return out;
}

export function ruleMatches(
  tx: ApplicableTransaction,
  rule: RuleConfig,
): boolean {
  const cfg = rule.matchConfig ?? {};
  switch (rule.matchType) {
    case "description_contains": {
      const needle = pickStr(cfg, "needle");
      if (!needle) return false;
      const caseSensitive = pickBool(cfg, "caseSensitive") ?? false;
      const haystack = caseSensitive
        ? tx.description
        : tx.description.toLowerCase();
      const n = caseSensitive ? needle : needle.toLowerCase();
      return haystack.includes(n);
    }
    case "description_regex": {
      const pattern = pickStr(cfg, "pattern");
      if (!pattern) return false;
      const flags = pickStr(cfg, "flags") ?? "i";
      try {
        return new RegExp(pattern, flags).test(tx.description);
      } catch {
        return false;
      }
    }
    case "counterparty_match": {
      const needle = pickStr(cfg, "needle");
      if (!needle || !tx.counterpartyName) return false;
      const caseSensitive = pickBool(cfg, "caseSensitive") ?? false;
      const haystack = caseSensitive
        ? tx.counterpartyName
        : tx.counterpartyName.toLowerCase();
      const n = caseSensitive ? needle : needle.toLowerCase();
      return haystack.includes(n);
    }
    case "amount_exact": {
      const value = pickBig(cfg, "amountMinor");
      if (value == null) return false;
      const tolerance = pickBig(cfg, "toleranceMinor") ?? 0n;
      const diff =
        tx.amountMinor > value
          ? tx.amountMinor - value
          : value - tx.amountMinor;
      return diff <= tolerance;
    }
    case "amount_range": {
      const min = pickBig(cfg, "minMinor");
      const max = pickBig(cfg, "maxMinor");
      if (min == null && max == null) return false;
      const v = tx.amountMinor;
      if (min != null && v < min) return false;
      if (max != null && v > max) return false;
      return true;
    }
    case "date_range_match": {
      const fromStr = pickStr(cfg, "from");
      const toStr = pickStr(cfg, "to");
      const from = fromStr ? new Date(fromStr) : null;
      const to = toStr ? new Date(toStr) : null;
      if (
        (from && Number.isNaN(from.getTime())) ||
        (to && Number.isNaN(to.getTime()))
      ) {
        return false;
      }
      if (from && tx.transactionDate < from) return false;
      if (to && tx.transactionDate > to) return false;
      return !!(from || to);
    }
    default: {
      // Exhaustiveness guard.
      const _exh: never = rule.matchType;
      void _exh;
      return false;
    }
  }
}

function pickStr(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function pickBool(o: Record<string, unknown>, k: string): boolean | undefined {
  const v = o[k];
  return typeof v === "boolean" ? v : undefined;
}

function pickBig(o: Record<string, unknown>, k: string): bigint | null {
  const v = o[k];
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === "string" && /^-?\d+$/.test(v)) {
    try {
      return BigInt(v);
    } catch {
      return null;
    }
  }
  return null;
}
