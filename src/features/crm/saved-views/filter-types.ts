/**
 * CRM-SAVED-VIEWS-BULK (#169) — shared filter vocabulary.
 *
 * Pure types + helpers for the advanced multi-condition <FilterBar>. NO
 * "use server" here — this module is imported by both the client bar
 * (live, in-browser filtering) and the read/write services, so it must
 * export sync helpers/consts/types (BUILD-SAFETY PR #168: a "use server"
 * file may export ONLY async functions).
 *
 * A saved view's `filterJson` is exactly `FilterCondition[]`; `columnsJson`
 * is `string[] | null` (ordered visible column keys, null → list default).
 */

/** Comparison operators an advanced condition can use. */
export type FilterOperator =
  | "is" // value ∈ values (equality / multi-select OR)
  | "is_not" // value ∉ values
  | "contains" // substring (case-insensitive)
  | "not_contains"
  | "is_set" // non-empty
  | "is_empty"; // empty / null

/** The kind of UI control a field renders for its values. */
export type FilterFieldType = "select" | "text";

/** One advanced filter row: <field> <operator> <values>. */
export interface FilterCondition {
  /** Matches a FilterFieldDef.key. */
  field: string;
  op: FilterOperator;
  /** Selected values. Empty for is_set / is_empty. */
  values: string[];
}

/** Declarative description of a filterable column. */
export interface FilterFieldDef {
  key: string;
  /** Human label shown in the field picker + chip. */
  label: string;
  type: FilterFieldType;
  /** For type === "select": the allowed options. */
  options?: { value: string; label: string }[];
}

/** Operators offered per field type. */
export const OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  select: ["is", "is_not", "is_set", "is_empty"],
  text: ["contains", "not_contains", "is", "is_set", "is_empty"],
};

/** Human labels for operators (chip + picker). */
export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  not_contains: "doesn't contain",
  is_set: "is set",
  is_empty: "is empty",
};

/** Operators that take no values (the value control is hidden). */
export function operatorTakesNoValue(op: FilterOperator): boolean {
  return op === "is_set" || op === "is_empty";
}

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Evaluate a single condition against a raw cell value. Multi-select
 * conditions match with OR semantics (Attio behavior). Returns true when
 * the condition has no actionable values (so an in-progress chip doesn't
 * hide every row).
 */
export function matchCondition(cell: unknown, cond: FilterCondition): boolean {
  const cellStr = norm(cell);
  const hasCell = cellStr.length > 0;
  switch (cond.op) {
    case "is_set":
      return hasCell;
    case "is_empty":
      return !hasCell;
    case "is": {
      if (cond.values.length === 0) return true;
      return cond.values.some((v) => norm(v) === cellStr);
    }
    case "is_not": {
      if (cond.values.length === 0) return true;
      return cond.values.every((v) => norm(v) !== cellStr);
    }
    case "contains": {
      if (cond.values.length === 0) return true;
      return cond.values.some((v) => cellStr.includes(norm(v)));
    }
    case "not_contains": {
      if (cond.values.length === 0) return true;
      return cond.values.every((v) => !cellStr.includes(norm(v)));
    }
    default:
      return true;
  }
}

/**
 * AND across all conditions. `getCell(field)` resolves a row's value for a
 * given field key. A row passes when every condition matches.
 */
export function matchAllConditions(
  conditions: FilterCondition[],
  getCell: (field: string) => unknown,
): boolean {
  return conditions.every((c) => matchCondition(getCell(c.field), c));
}

/**
 * Defensive coercion of an unknown JSON blob (from filterJson) into a clean
 * FilterCondition[]. Drops malformed entries rather than throwing.
 */
export function coerceConditions(raw: unknown): FilterCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: FilterCondition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const field = typeof rec.field === "string" ? rec.field : null;
    const op = typeof rec.op === "string" ? (rec.op as FilterOperator) : null;
    if (!field || !op) continue;
    if (!(op in OPERATOR_LABEL)) continue;
    const values = Array.isArray(rec.values)
      ? rec.values.filter((v): v is string => typeof v === "string")
      : [];
    out.push({ field, op, values });
  }
  return out;
}

/** Coerce an unknown columnsJson blob into `string[] | null`. */
export function coerceColumns(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const cols = raw.filter((v): v is string => typeof v === "string");
  return cols.length > 0 ? cols : null;
}

/** Short human summary of a condition, for chips ("Status is Active"). */
export function summarizeCondition(
  cond: FilterCondition,
  field: FilterFieldDef | undefined,
): string {
  const label = field?.label ?? cond.field;
  const opLabel = OPERATOR_LABEL[cond.op];
  if (operatorTakesNoValue(cond.op)) return `${label} ${opLabel}`;
  const valueLabels = cond.values.map(
    (v) => field?.options?.find((o) => o.value === v)?.label ?? v,
  );
  const valueStr =
    valueLabels.length === 0
      ? "…"
      : valueLabels.length <= 2
        ? valueLabels.join(", ")
        : `${valueLabels[0]} +${valueLabels.length - 1}`;
  return `${label} ${opLabel} ${valueStr}`;
}
