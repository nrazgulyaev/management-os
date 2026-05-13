/**
 * Sprint 4 — Pure parsing + column-mapping helpers for the
 * transaction import wizard.
 *
 * Two source ingests are supported in this sprint:
 *   - "sheets_paste" — TSV/CSV pasted from Google Sheets or Excel
 *   - "xlsx"         — uploaded .xlsx/.xls/.ods file
 *
 * "sheets_live" (Google Sheets OAuth API) is Sprint 4.5.
 *
 * Both ingests land in the same `ParsedSheet` shape:
 *   { headers: string[], rows: Record<string, string>[] }
 *
 * The `applyMapping(parsed, mapping)` helper then projects that into
 * the shape the bulk action expects, applying `constants` (e.g. a
 * fixed currency) and `transform.direction_map` (e.g. "Expense" →
 * "outflow").
 *
 * No I/O, no DB, no server-only — importable from anywhere.
 */

import { z } from "zod";
import * as XLSX from "xlsx";

// The import library operates in operator-facing (major-units, string)
// space; the bulk action converts to BulkTransactionRow at commit
// time. Keeping the import preview type local avoids coupling the
// parser to the server-only bulk-action module.

// ============================================================================
// Types
// ============================================================================

export interface ParsedSheet {
  headers: string[];
  /** rows[i][header] = cell value. Missing cells are empty strings. */
  rows: Record<string, string>[];
}

export type DestinationField =
  | "date"
  | "direction"
  | "amountMajor"
  | "currency"
  | "categoryName"
  | "projectCode"
  | "counterpartyName"
  | "description"
  | "notes";

export const DESTINATION_FIELDS: readonly DestinationField[] = [
  "date",
  "direction",
  "amountMajor",
  "currency",
  "categoryName",
  "projectCode",
  "counterpartyName",
  "description",
  "notes",
] as const;

export interface ColumnMapping {
  /**
   * Source → destination map. e.g. { "Дата": "date", "Amount": "amountMajor" }.
   * Sources not listed are ignored. A destination not present in this
   * map either uses `constants[destination]` (if set) or is left blank
   * for the operator to fill manually.
   */
  destination_mapping: Partial<Record<string, DestinationField>>;
  /**
   * Fixed values applied to every row when the source has no
   * corresponding column. Common case: source sheet only has USD
   * amounts → `constants.currency = "USD"`.
   */
  constants?: Partial<Record<DestinationField, string>>;
  /**
   * Per-field transforms applied AFTER source resolution. Today only
   * `direction_map` is supported — e.g. { "Expense": "outflow",
   * "Income": "inflow" } maps human labels to API enums.
   */
  transform?: {
    direction_map?: Record<string, "inflow" | "outflow">;
  };
}

export const columnMappingSchema: z.ZodType<ColumnMapping> = z.object({
  destination_mapping: z.record(
    z.string(),
    z.enum(DESTINATION_FIELDS as unknown as [DestinationField]),
  ),
  constants: z
    .record(
      z.enum(DESTINATION_FIELDS as unknown as [DestinationField]),
      z.string(),
    )
    .optional(),
  transform: z
    .object({
      direction_map: z
        .record(z.string(), z.enum(["inflow", "outflow"]))
        .optional(),
    })
    .optional(),
});

// ============================================================================
// Paste parser — auto-detects TSV vs CSV
// ============================================================================

/**
 * Parses TSV/CSV pasted from the clipboard.
 *
 *   - Tab characters in the first line → TSV (Google Sheets default).
 *   - Otherwise CSV with comma separator. Quoted cells with embedded
 *     commas + newlines are handled (RFC-4180 minimal).
 *
 * The first non-empty line is treated as the header row.
 */
export function parsePaste(raw: string): ParsedSheet {
  if (!raw || raw.trim() === "") {
    return { headers: [], rows: [] };
  }
  // Detect separator from the first line.
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? "";
  const sep = firstLine.includes("\t") ? "\t" : ",";
  const records =
    sep === "\t"
      ? parseTsv(raw)
      : parseCsv(raw);
  if (records.length === 0) return { headers: [], rows: [] };
  const [headerRow, ...dataRows] = records;
  const headers = headerRow.map((h) => h.trim());
  const rows = dataRows
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = (r[i] ?? "").trim();
      }
      return obj;
    });
  return { headers, rows };
}

function parseTsv(raw: string): string[][] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.split("\t"));
}

/**
 * Minimal RFC-4180 CSV parser. Handles:
 *   - quoted cells with embedded commas
 *   - escaped quotes ("")
 *   - CRLF + LF line endings
 * Does NOT handle: cells spanning multiple lines (rare in copy-paste).
 */
function parseCsv(raw: string): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuote) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ",") {
      cur.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      cur.push(cell);
      cell = "";
      if (cur.length > 0 && cur.some((c) => c !== "")) out.push(cur);
      cur = [];
      // Skip the \n in \r\n.
      if (ch === "\r" && raw[i + 1] === "\n") i++;
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || cur.length > 0) {
    cur.push(cell);
    if (cur.some((c) => c !== "")) out.push(cur);
  }
  return out;
}

// ============================================================================
// XLSX parser — first sheet, header on row 1
// ============================================================================

/**
 * Parses an XLSX/ODS/XLS file from an ArrayBuffer (browser File →
 * arrayBuffer()). Reads the first sheet; first row treated as
 * headers. Cells with formulas are evaluated by xlsx.js (no live
 * recalc — uses the cached values).
 */
export function parseXlsx(buffer: ArrayBuffer): ParsedSheet {
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[firstSheetName];
  // sheet_to_json with header:1 → array of arrays (raw values).
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (aoa.length === 0) return { headers: [], rows: [] };
  const headers = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim());
  const rows = aoa.slice(1).map((row) => {
    const arr = row as unknown[];
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = String(arr[i] ?? "").trim();
    }
    return obj;
  });
  return { headers, rows };
}

// ============================================================================
// Heuristic auto-mapping — when the operator hasn't built a template yet
// ============================================================================

const HEADER_HEURISTICS: Array<{ regex: RegExp; dest: DestinationField }> = [
  // English
  { regex: /^date|^transaction date|^txn date/i, dest: "date" },
  { regex: /^type|^direction|^debit\/credit/i, dest: "direction" },
  { regex: /^amount|^usd|^total/i, dest: "amountMajor" },
  { regex: /^currency|^ccy/i, dest: "currency" },
  { regex: /^category|^expense category/i, dest: "categoryName" },
  { regex: /^project/i, dest: "projectCode" },
  { regex: /^vendor|^counterparty|^payee|^supplier/i, dest: "counterpartyName" },
  { regex: /^description|^memo|^subject/i, dest: "description" },
  { regex: /^note(s)?/i, dest: "notes" },
  // Russian (operator's language)
  { regex: /^дата/i, dest: "date" },
  { regex: /^тип|^напр/i, dest: "direction" },
  { regex: /^сумма/i, dest: "amountMajor" },
  { regex: /^валюта/i, dest: "currency" },
  { regex: /^катег/i, dest: "categoryName" },
  { regex: /^проект/i, dest: "projectCode" },
  { regex: /^вендор|^поставщ|^контраг/i, dest: "counterpartyName" },
  { regex: /^описание/i, dest: "description" },
  { regex: /^прим|^заметк/i, dest: "notes" },
];

/**
 * Best-guess mapping based on header text. Operators see this as the
 * pre-filled "Auto" suggestion they can override before importing.
 */
export function autoMapHeaders(headers: string[]): ColumnMapping {
  const destination_mapping: Record<string, DestinationField> = {};
  const used = new Set<DestinationField>();
  for (const h of headers) {
    for (const { regex, dest } of HEADER_HEURISTICS) {
      if (used.has(dest)) continue;
      if (regex.test(h)) {
        destination_mapping[h] = dest;
        used.add(dest);
        break;
      }
    }
  }
  return { destination_mapping };
}

// ============================================================================
// Apply mapping — projects ParsedSheet → BulkTransactionRow[]
// ============================================================================

/**
 * Operator-facing row shape (major units, strings). Converted to the
 * server `BulkTransactionRow` shape at commit time by the consumer.
 */
export type PreviewRow = Partial<Record<DestinationField, string>>;

export interface AppliedRow {
  /** Operator-facing row (major units, strings). */
  row: PreviewRow;
  /** Source row index (0-based, header excluded). */
  sourceIndex: number;
  /**
   * Validation issues spotted at mapping time. Soft — the operator
   * fixes inline in the preview SpreadsheetView. Hard validation
   * happens server-side in the bulk action.
   */
  warnings: string[];
}

export function applyMapping(
  parsed: ParsedSheet,
  mapping: ColumnMapping,
): AppliedRow[] {
  const reverse: Record<DestinationField, string[]> = {} as Record<
    DestinationField,
    string[]
  >;
  for (const [src, dest] of Object.entries(mapping.destination_mapping)) {
    if (!dest) continue;
    reverse[dest] ??= [];
    reverse[dest].push(src);
  }

  return parsed.rows.map((row, idx) => {
    const out: PreviewRow = {};
    const warnings: string[] = [];

    // 1. Apply constants first — they're the fallback.
    if (mapping.constants) {
      for (const [k, v] of Object.entries(mapping.constants)) {
        if (v) {
          out[k as DestinationField] = v;
        }
      }
    }

    // 2. Apply per-field source columns (overrides constants when present).
    for (const dest of DESTINATION_FIELDS) {
      const srcCols = reverse[dest];
      if (!srcCols) continue;
      for (const src of srcCols) {
        const raw = row[src];
        if (raw === undefined || raw === "") continue;
        let value: string = raw;
        if (dest === "direction" && mapping.transform?.direction_map) {
          const mapped = mapping.transform.direction_map[raw.trim()];
          if (mapped) value = mapped;
        }
        out[dest] = value;
        break;
      }
    }

    // 3. Soft validation warnings — flag obvious problems but let the
    //    bulk action be the source of truth.
    if (out.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(out.date))) {
      warnings.push(`Date "${out.date}" not in YYYY-MM-DD`);
    }
    if (out.direction) {
      const lower = String(out.direction).toLowerCase();
      if (lower !== "inflow" && lower !== "outflow") {
        warnings.push(
          `Direction "${out.direction}" not 'inflow' or 'outflow' (add a transform.direction_map)`,
        );
      }
    }
    if (out.amountMajor) {
      const n = Number(out.amountMajor);
      if (!Number.isFinite(n) || n <= 0) {
        warnings.push(`Amount "${out.amountMajor}" not a positive number`);
      }
    }
    if (!out.description) {
      warnings.push("Description is required");
    }

    return { row: out, sourceIndex: idx, warnings };
  });
}
