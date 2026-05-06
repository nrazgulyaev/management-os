/**
 * Stage 6.P0.7 — Pure CSV parsing helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Wraps `papaparse` to give a stable, testable shape:
 *   { headers: string[], rows: Array<Record<string, string>> }
 *
 * Why papaparse over hand-rolled split-on-comma:
 *   - Handles RFC 4180 edge cases (quoted commas, escaped quotes, embedded newlines).
 *   - Handles BOM markers (Excel exports CSV with UTF-8 BOM by default).
 *   - 50KB; standard library has no built-in CSV parser.
 *
 * Returns string-typed cells; type coercion is the validator's job.
 */

import Papa from "papaparse";

export interface ParsedTable {
  headers: string[];
  rows: Array<Record<string, string>>;
  /** Errors reported by the underlying parser (malformed rows). */
  parseErrors: Array<{ row: number; message: string }>;
}

export interface ParseCsvOptions {
  /** Custom delimiter; auto-detected if omitted. */
  delimiter?: string;
  /** Skip leading blank rows that some Excel exports include. Default: true. */
  skipEmptyLines?: boolean;
  /** Cap the number of data rows parsed (excludes header). Default: 100_000. */
  maxRows?: number;
}

const DEFAULT_MAX_ROWS = 100_000;

export function parseCsv(input: string, opts: ParseCsvOptions = {}): ParsedTable {
  // Strip UTF-8 BOM if present (Excel CSV exports include it).
  const cleaned = input.replace(/^﻿/, "");

  const result = Papa.parse<string[]>(cleaned, {
    delimiter: opts.delimiter ?? "",
    skipEmptyLines: opts.skipEmptyLines !== false ? "greedy" : false,
    header: false,
    transform: (v) => v.trim(),
  });

  const data = result.data as string[][];
  if (data.length === 0) {
    return { headers: [], rows: [], parseErrors: [] };
  }

  const headers = data[0]
    .map((h) => h.trim())
    .filter((h) => h.length > 0);

  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const dataRows = data.slice(1, 1 + maxRows);

  const rows: Array<Record<string, string>> = [];
  for (const r of dataRows) {
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (r[i] ?? "").toString();
    }
    rows.push(row);
  }

  const parseErrors = result.errors.map((e) => ({
    row: e.row ?? -1,
    message: e.message,
  }));

  return { headers, rows, parseErrors };
}

/**
 * Convert a `ParsedTable` back to CSV. Used by the export side
 * (P0.7.7) so the same module owns both directions of the conversion.
 */
export function tableToCsv(input: {
  headers: string[];
  rows: Array<Record<string, unknown>>;
}): string {
  return Papa.unparse(
    {
      fields: input.headers,
      data: input.rows.map((r) =>
        input.headers.map((h) => {
          const v = r[h];
          if (v === null || v === undefined) return "";
          if (typeof v === "object") return JSON.stringify(v);
          return String(v);
        }),
      ),
    },
    { header: true },
  );
}
