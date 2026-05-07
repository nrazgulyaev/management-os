/**
 * Stage 6.P3.B — CSV statement parser.
 *
 * Pure helpers — no I/O. papaparse is dynamically imported (same lazy
 * pattern as the channel-manager XML parsers in P1.B).
 *
 * Two-stage flow used by the import wizard:
 *   1. `detectCsvDialect(content)` + `autoDetectColumnMapping(headers)`
 *      run on a small sample of the upload to populate the operator's
 *      "review mapping" UI.
 *   2. Operator confirms / tweaks the mapping → `parseCsvStatement` runs
 *      against the full file.
 */

import {
  autoDetectAmountFormat,
  parseAmountToMinor,
  parseDateFlexible,
  synthesizeTransactionId,
  type ParseResult,
  type ParsedStatementRow,
} from "./types";

// ---------------------------------------------------------------------------
// Lazy papaparse load
// ---------------------------------------------------------------------------
let papaparseModule: typeof import("papaparse") | null = null;

async function loadPapaparse(): Promise<typeof import("papaparse")> {
  if (papaparseModule) return papaparseModule;
  // papaparse ships a default export; the dynamic import returns
  // `{ default: Papa, ... }`. Resolve to the object that carries
  // `parse()`.
  const mod = (await import("papaparse")) as
    | typeof import("papaparse")
    | { default: typeof import("papaparse") };
  papaparseModule = ("parse" in mod
    ? (mod as typeof import("papaparse"))
    : (mod as { default: typeof import("papaparse") }).default);
  return papaparseModule;
}

/** Test-only — reset the cached module so a test can verify lazy-load. */
export function __resetPapaparseCacheForTests() {
  papaparseModule = null;
}

// ---------------------------------------------------------------------------
// Public API — types
// ---------------------------------------------------------------------------

export interface CSVColumnMapping {
  /** Required — column carrying the transaction date. */
  date: string;
  /** Required — column carrying the transaction amount, OR set
   *  `amountSign === "separate_columns"` and supply `debit` + `credit`
   *  instead. */
  amount?: string;
  /** Optional — separate debit / credit columns. Mutually exclusive
   *  with `amount`. */
  debit?: string;
  credit?: string;
  /** Required — column carrying a human-readable description. */
  description: string;
  /** Optional. */
  currency?: string;
  counterparty?: string;
  reference?: string;
  balance?: string;
  externalTransactionId?: string;
  /** Optional value-date column (often distinct from the booking date). */
  valueDate?: string;
}

export interface CSVParseOptions {
  /** Auto-detected when omitted. */
  delimiter?: "," | ";" | "\t" | "|";
  hasHeader?: boolean;
  /** Date format hint passed to `parseDateFlexible`. */
  dateFormat?:
    | "iso"
    | "ymd_slash"
    | "dmy_slash"
    | "dmy_dash"
    | "dmy_dot"
    | "mdy_slash";
  /** Auto-detected when omitted. */
  amountFormat?: "standard" | "european";
  /** Whether amount sign comes from a single signed column or from
   *  separate debit + credit columns. */
  amountSign?: "mixed" | "separate_columns";
  /** Default currency to apply when no currency column / value present. */
  defaultCurrency?: string;
  /** Used to seed `synthesizeTransactionId`. Keep stable per source so
   *  re-imports dedupe cleanly. */
  source?: string;
}

export interface CSVDialect {
  delimiter: "," | ";" | "\t" | "|";
  hasHeader: boolean;
  /** `iso` vs `dmy_slash` etc. — heuristic guess from a sample. */
  dateFormat?: CSVParseOptions["dateFormat"];
  amountFormat?: "standard" | "european";
}

// ---------------------------------------------------------------------------
// Dialect detection
// ---------------------------------------------------------------------------

/**
 * Sniff delimiter + header presence from the first ~10 lines.
 *
 * Picks the delimiter that yields the most consistent column count
 * across the sample — the standard CSV-sniffer trick. Header presence
 * is a weak heuristic: header-likely if line-1 has no digits and
 * line-2 does.
 */
export function detectCsvDialect(content: string): CSVDialect {
  const lines = content
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 10);
  if (lines.length === 0) {
    return {
      delimiter: ",",
      hasHeader: false,
    };
  }

  const candidates: Array<"," | ";" | "\t" | "|"> = [",", ";", "\t", "|"];
  let bestDelim: "," | ";" | "\t" | "|" = ",";
  let bestScore = -1;
  for (const d of candidates) {
    const counts = lines.map((l) => l.split(d).length);
    if (counts.every((c) => c < 2)) continue; // single-column = bad delim
    // Score = mean count, penalize variance.
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance =
      counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    const score = mean - variance;
    if (score > bestScore) {
      bestScore = score;
      bestDelim = d;
    }
  }

  // Header presence: line-1 has no digits AND line-2 does.
  const line1HasDigits = /\d/.test(lines[0]);
  const line2HasDigits = lines.length > 1 ? /\d/.test(lines[1]) : true;
  const hasHeader = !line1HasDigits && line2HasDigits;

  // Date + amount format hints from a data row (skip header if present).
  const sampleRow = lines[hasHeader ? 1 : 0];
  let dateFormat: CSVDialect["dateFormat"] | undefined;
  let amountFormat: CSVDialect["amountFormat"] | undefined;
  if (sampleRow) {
    const cells = sampleRow.split(bestDelim);
    for (const cell of cells) {
      let isDate = false;
      if (!dateFormat) {
        if (/^\d{4}-\d{1,2}-\d{1,2}/.test(cell)) {
          dateFormat = "iso";
          isDate = true;
        } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cell)) {
          dateFormat = "dmy_slash";
          isDate = true;
        } else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(cell)) {
          dateFormat = "dmy_dot";
          isDate = true;
        } else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(cell)) {
          dateFormat = "dmy_dash";
          isDate = true;
        }
      } else {
        // dateFormat already known; flag this cell as date-shaped if
        // it matches any of the patterns we recognize so we don't try
        // to read amount-format hints from it.
        if (
          /^\d{4}-\d{1,2}-\d{1,2}/.test(cell) ||
          /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}$/.test(cell)
        ) {
          isDate = true;
        }
      }
      // Amount-format hint: skip date-shaped cells. A date like
      // "07.05.2026" looks like a digit-dot-digit but tells us
      // nothing about decimal format.
      if (!amountFormat && !isDate && /[0-9][.,][0-9]/.test(cell)) {
        amountFormat = autoDetectAmountFormat(cell);
      }
    }
  }

  return {
    delimiter: bestDelim,
    hasHeader,
    dateFormat,
    amountFormat,
  };
}

// ---------------------------------------------------------------------------
// Auto-suggest column mapping from headers
// ---------------------------------------------------------------------------

const MAPPING_PATTERNS: Record<keyof CSVColumnMapping, RegExp[]> = {
  date: [
    /^(transaction\s*)?date$/i,
    /^trans(?:action)?\s*date$/i,
    /^posting\s*date$/i,
    /^booking\s*date$/i,
    /^tanggal$/i, // Indonesian
    /^дата$/i, // Russian
  ],
  amount: [/^amount$/i, /^value$/i, /^jumlah$/i, /^сумма$/i],
  debit: [/^debit$/i, /^withdrawal$/i, /^out$/i, /^debet$/i, /^списание$/i],
  credit: [/^credit$/i, /^deposit$/i, /^in$/i, /^kredit$/i, /^зачисление$/i],
  description: [
    /^description$/i,
    /^narrative$/i,
    /^memo$/i,
    /^details?$/i,
    /^reference$/i,
    /^keterangan$/i,
    /^описание$/i,
    /^назначение$/i,
  ],
  currency: [/^currency$/i, /^ccy$/i, /^mata\s*uang$/i, /^валюта$/i],
  counterparty: [
    /^counterparty$/i,
    /^payee$/i,
    /^merchant$/i,
    /^beneficiary$/i,
    /^name$/i,
    /^pihak\s*lawan$/i,
  ],
  reference: [/^reference$/i, /^ref(?:erence)?\s*(?:no|number)?$/i, /^id$/i],
  balance: [/^balance$/i, /^saldo$/i, /^остаток$/i, /^running\s*balance$/i],
  externalTransactionId: [
    /^transaction\s*id$/i,
    /^txn\s*id$/i,
    /^transaction\s*number$/i,
    /^id\s*transaksi$/i,
  ],
  valueDate: [/^value\s*date$/i, /^settled\s*date$/i, /^val\s*date$/i],
};

/**
 * Suggest a column mapping by matching headers against per-field
 * regex patterns. Returns a partial map — the operator fills in
 * remaining fields in the import wizard.
 */
export function autoDetectColumnMapping(
  headers: string[],
): Partial<CSVColumnMapping> {
  const mapping: Partial<CSVColumnMapping> = {};
  for (const [field, patterns] of Object.entries(MAPPING_PATTERNS) as Array<
    [keyof CSVColumnMapping, RegExp[]]
  >) {
    for (const h of headers) {
      const trimmed = h.trim();
      if (patterns.some((p) => p.test(trimmed))) {
        mapping[field] = trimmed;
        break;
      }
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// parseCsvStatement — full parse against confirmed mapping
// ---------------------------------------------------------------------------

export async function parseCsvStatement(
  content: string,
  mapping: CSVColumnMapping,
  options: CSVParseOptions = {},
): Promise<ParseResult> {
  const dialect = detectCsvDialect(content);
  const delimiter = options.delimiter ?? dialect.delimiter;
  const hasHeader = options.hasHeader ?? dialect.hasHeader;
  const amountFormat = options.amountFormat ?? dialect.amountFormat ?? "standard";
  const dateFormat = options.dateFormat ?? dialect.dateFormat;
  const source = options.source ?? "csv";
  const defaultCurrency = options.defaultCurrency ?? "USD";
  const amountSign = options.amountSign ?? "mixed";

  const Papa = await loadPapaparse();
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: hasHeader,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  const rows: ParsedStatementRow[] = [];
  const failed: Array<{ rowIndex: number; reason: string }> = [];
  let skipped = 0;
  let earliest: Date | undefined;
  let latest: Date | undefined;

  // When hasHeader=false, papaparse returns rows as arrays. Convert
  // to indexed records so the mapping (which uses column names) still
  // works — operator must have used positional names like "0","1","2".
  const records: Record<string, string>[] = hasHeader
    ? (parsed.data as Record<string, string>[])
    : (parsed.data as unknown as string[][]).map((r) => {
        const o: Record<string, string> = {};
        r.forEach((v, i) => {
          o[String(i)] = v;
        });
        return o;
      });

  records.forEach((row, idx) => {
    const rowNum = idx + (hasHeader ? 2 : 1);
    if (!row || Object.values(row).every((v) => !v)) {
      skipped++;
      return;
    }
    try {
      const dateRaw = row[mapping.date];
      const date = parseDateFlexible(dateRaw, dateFormat);
      if (!date) {
        failed.push({
          rowIndex: rowNum,
          reason: `unparseable date: "${dateRaw}"`,
        });
        return;
      }

      let amountMinor: bigint | null;
      if (amountSign === "separate_columns") {
        if (!mapping.debit || !mapping.credit) {
          failed.push({
            rowIndex: rowNum,
            reason: "amountSign=separate_columns but mapping.debit/credit missing",
          });
          return;
        }
        const dRaw = row[mapping.debit] ?? "";
        const cRaw = row[mapping.credit] ?? "";
        const d = parseAmountToMinor(dRaw, { format: amountFormat });
        const c = parseAmountToMinor(cRaw, { format: amountFormat });
        if (d == null && c == null) {
          failed.push({ rowIndex: rowNum, reason: "no debit or credit value" });
          return;
        }
        // Debit column is naturally negative; credit positive. Stored
        // values are absolute, so we re-sign them per our convention.
        amountMinor = (c ?? 0n) - (d ?? 0n);
      } else {
        if (!mapping.amount) {
          failed.push({
            rowIndex: rowNum,
            reason: "amountSign=mixed but mapping.amount missing",
          });
          return;
        }
        const aRaw = row[mapping.amount] ?? "";
        amountMinor = parseAmountToMinor(aRaw, { format: amountFormat });
        if (amountMinor == null) {
          failed.push({
            rowIndex: rowNum,
            reason: `unparseable amount: "${aRaw}"`,
          });
          return;
        }
      }

      const description = (row[mapping.description] ?? "").trim();
      const currency = (mapping.currency && row[mapping.currency]?.trim()) || defaultCurrency;

      const externalTransactionId =
        (mapping.externalTransactionId &&
          row[mapping.externalTransactionId]?.trim()) ||
        synthesizeTransactionId({
          source,
          date,
          amountMinor,
          description,
        });

      const counterpartyName = mapping.counterparty
        ? row[mapping.counterparty]?.trim() || undefined
        : undefined;
      const externalReference = mapping.reference
        ? row[mapping.reference]?.trim() || undefined
        : undefined;
      const valueDate = mapping.valueDate
        ? parseDateFlexible(row[mapping.valueDate] ?? "", dateFormat) ??
          undefined
        : undefined;

      if (!earliest || date < earliest) earliest = date;
      if (!latest || date > latest) latest = date;

      rows.push({
        externalTransactionId,
        externalReference,
        transactionDate: date,
        valueDate,
        amountMinor,
        currency,
        description: description || "(no description)",
        counterpartyName,
        rawPayload: row,
      });
    } catch (err) {
      failed.push({
        rowIndex: rowNum,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return {
    rows,
    diagnostics: {
      totalRowsExamined: records.length,
      rowsParsed: rows.length,
      rowsSkipped: skipped,
      rowsFailed: failed,
      periodStart: earliest,
      periodEnd: latest,
      notes: { delimiter, hasHeader, amountFormat, dateFormat },
    },
  };
}
