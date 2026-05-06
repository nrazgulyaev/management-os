/**
 * Stage 6.P0.7 — Pure XLSX parsing helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Wraps SheetJS (`xlsx`) to give the same `ParsedTable` shape as the
 * CSV parser. The bookkeeper exports Excel from accounting software
 * far more often than they hand-write CSV — supporting it natively
 * removes a major friction point. ~500KB cost; reasonable for a
 * P0 dependency given the alternative is hand-rolling .xlsx parsing
 * (zip + xml + worksheet + sharedStrings) which would be 1000+ LoC
 * and has well-documented edge-case bugs.
 *
 * Returns the FIRST sheet by default; callers can target a specific
 * sheet by name via opts.sheetName.
 */

import * as XLSX from "xlsx";
import type { ParsedTable } from "./csv-parser-helpers";

export interface ParseXlsxOptions {
  /** Pick a specific sheet. Defaults to the first sheet. */
  sheetName?: string;
  /** 1-indexed header row (default 1). Some workbooks have a title row first. */
  headerRow?: number;
  /** Cap data rows. Default 100_000. */
  maxRows?: number;
}

const DEFAULT_MAX_ROWS = 100_000;

/**
 * Parse a .xlsx file's bytes (Buffer / Uint8Array / ArrayBuffer).
 * The form upload component reads the file as ArrayBuffer + passes it here.
 */
export function parseXlsx(
  bytes: Uint8Array | ArrayBuffer | Buffer,
  opts: ParseXlsxOptions = {},
): ParsedTable {
  const wb = XLSX.read(bytes, { type: "array" });
  const sheetName = opts.sheetName ?? wb.SheetNames[0];
  if (!sheetName || !wb.Sheets[sheetName]) {
    return { headers: [], rows: [], parseErrors: [{ row: -1, message: `Sheet not found: ${sheetName ?? "(none)"}` }] };
  }
  const sheet = wb.Sheets[sheetName];

  // Convert to AOA (array-of-arrays) so we can pick any header row;
  // SheetJS's `header: 1` mode is type-stable.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false, // get formatted strings; type coercion belongs to validators
  });

  if (aoa.length === 0) {
    return { headers: [], rows: [], parseErrors: [] };
  }

  const headerRowIdx = (opts.headerRow ?? 1) - 1;
  if (headerRowIdx >= aoa.length) {
    return {
      headers: [],
      rows: [],
      parseErrors: [
        {
          row: -1,
          message: `headerRow ${opts.headerRow} exceeds sheet row count ${aoa.length}`,
        },
      ],
    };
  }

  const headers = (aoa[headerRowIdx] as unknown[])
    .map((h) => (h ?? "").toString().trim())
    .filter((h) => h.length > 0);

  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const dataRows = aoa.slice(headerRowIdx + 1, headerRowIdx + 1 + maxRows);

  const rows: Array<Record<string, string>> = [];
  for (const r of dataRows) {
    const arr = r as unknown[];
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (arr[i] ?? "").toString().trim();
    }
    rows.push(row);
  }

  return { headers, rows, parseErrors: [] };
}

/**
 * List the sheet names in a workbook — used by the wizard's "pick sheet"
 * step when an XLSX has multiple sheets.
 */
export function listSheetNames(
  bytes: Uint8Array | ArrayBuffer | Buffer,
): string[] {
  try {
    const wb = XLSX.read(bytes, { type: "array" });
    return wb.SheetNames;
  } catch {
    return [];
  }
}

/**
 * Convert a `ParsedTable` to XLSX bytes. Used by the export side
 * (P0.7.7).
 */
export function tableToXlsx(input: {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  sheetName?: string;
}): Buffer {
  const aoa = [
    input.headers,
    ...input.rows.map((r) =>
      input.headers.map((h) => {
        const v = r[h];
        if (v === null || v === undefined) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return v;
      }),
    ),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, input.sheetName ?? "Sheet1");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return out as Buffer;
}
