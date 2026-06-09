/**
 * Owners-list TAG filter matcher.
 *
 * The shared <matchCondition> understands single-value cells; a CRM record can
 * carry MANY tags, so tag conditions get multi-membership semantics here:
 *   - is        → row has ANY of the selected tag ids (OR)
 *   - is_not    → row has NONE of the selected tag ids
 *   - is_set    → row has at least one tag
 *   - is_empty  → row has no tags
 * An in-progress condition with no selected values matches everything (so the
 * list doesn't blank out while the operator is still picking).
 */

import type { FilterCondition } from "@/features/crm/saved-views/filter-types";

export function matchTagCondition(
  ownerTagIds: string[],
  cond: FilterCondition,
): boolean {
  const owned = new Set(ownerTagIds);
  switch (cond.op) {
    case "is_set":
      return owned.size > 0;
    case "is_empty":
      return owned.size === 0;
    case "is":
      if (cond.values.length === 0) return true;
      return cond.values.some((v) => owned.has(v));
    case "is_not":
      if (cond.values.length === 0) return true;
      return cond.values.every((v) => !owned.has(v));
    default:
      // contains / not_contains aren't offered for select fields — pass.
      return true;
  }
}
