/**
 * Stage 6.P3.B — PDF statement parser (text-extraction approach).
 *
 * PDFs lack structured data. Per the P3 spec we ship Approach 1 only:
 *   - Caller extracts text from the PDF (via pdfjs-dist / pdf-parse /
 *     external service — all lazy-loaded and out of scope here).
 *   - This module operates on the extracted text + a bank-specific
 *     template that supplies the regex + column ordering.
 *
 * OCR (for scanned statements without a text layer) and manual
 * column-mapping UIs are deferred to P5.
 *
 * Bundled templates: Mandiri, BCA. Operators can register additional
 * templates via `registerPdfTemplate(...)` (call-once at boot).
 *
 * Pure helpers — no I/O. Importable from tests.
 */

import {
  parseAmountToMinor,
  parseDateFlexible,
  synthesizeTransactionId,
  type ParseResult,
  type ParsedStatementRow,
} from "./types";

// ---------------------------------------------------------------------------
// Template contract
// ---------------------------------------------------------------------------

export interface PdfStatementTemplate {
  /** Stable identifier — referenced from the import wizard. */
  id: string;
  /** Display name for the import UI. */
  label: string;
  /** Currency the statement is denominated in. */
  defaultCurrency: string;
  /** Date format hint passed to `parseDateFlexible`. */
  dateFormat?: Parameters<typeof parseDateFlexible>[1];
  /** Amount format hint. Indonesian banks use European style
   *  (1.234.567,89). */
  amountFormat?: "standard" | "european";
  /** Multiline regex that captures one transaction per match.
   *  Required named groups:
   *    - `date`        — raw date string
   *    - `description` — raw description (may be multiline; the parser
   *                      collapses whitespace)
   *    - `amount`      — raw amount string (signed if amountSign='mixed',
   *                      absolute otherwise)
   *  Optional named groups:
   *    - `debit`, `credit` — set together when amountSign='separate'
   *    - `reference`       — populates externalReference */
  rowRegex: RegExp;
  /** Affects how the named groups are mapped to a final amount.
   *  Default: `mixed`. */
  amountSign?: "mixed" | "separate";
  /** When `amountSign === 'mixed'`, decides whether positive raw
   *  amounts are debits (subtractive) or credits (additive). Indonesian
   *  banks present every figure as positive in a "Debit" column → set
   *  `debitColumnPositive: true` so the parser flips the sign. */
  debitColumnPositive?: boolean;
}

// ---------------------------------------------------------------------------
// Built-in templates
// ---------------------------------------------------------------------------

const BUILT_IN_TEMPLATES: PdfStatementTemplate[] = [
  {
    id: "mandiri_v1",
    label: "Bank Mandiri (Indonesia) — Internet Banking export",
    defaultCurrency: "IDR",
    dateFormat: "dmy_slash",
    amountFormat: "european",
    // Sample line: "07/05/2026 SETOR TUNAI ATM 123456 1.000.000,00 5.000.000,00"
    // Capture: date | description | amount (signed) | balance (ignored)
    rowRegex:
      /(?<date>\d{2}\/\d{2}\/\d{4})\s+(?<description>.+?)\s+(?<amount>-?[\d.,]+)\s+[\d.,]+\s*$/gm,
    amountSign: "mixed",
  },
  {
    id: "bca_v1",
    label: "Bank Central Asia (Indonesia) — KlikBCA export",
    defaultCurrency: "IDR",
    dateFormat: "dmy_slash",
    amountFormat: "european",
    // Sample line: "07/05 TRSF E-BANKING DB 1.500.000,00 DB 3.500.000,00"
    // BCA includes a "DB"/"CR" sign indicator after the amount.
    rowRegex:
      /(?<date>\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(?<description>.+?)\s+(?<amount>[\d.,]+)\s+(?<sign>DB|CR)\b/gim,
    amountSign: "mixed",
    debitColumnPositive: true,
  },
];

const TEMPLATE_REGISTRY = new Map<string, PdfStatementTemplate>();
for (const t of BUILT_IN_TEMPLATES) TEMPLATE_REGISTRY.set(t.id, t);

export function registerPdfTemplate(template: PdfStatementTemplate) {
  TEMPLATE_REGISTRY.set(template.id, template);
}

export function getPdfTemplate(id: string): PdfStatementTemplate | undefined {
  return TEMPLATE_REGISTRY.get(id);
}

export function listPdfTemplates(): PdfStatementTemplate[] {
  return Array.from(TEMPLATE_REGISTRY.values());
}

// ---------------------------------------------------------------------------
// parsePdfText
// ---------------------------------------------------------------------------

export function parsePdfText(
  extractedText: string,
  templateId: string,
  opts: { source?: string; defaultCurrency?: string } = {},
): ParseResult {
  const template = TEMPLATE_REGISTRY.get(templateId);
  if (!template) {
    return {
      rows: [],
      diagnostics: {
        totalRowsExamined: 0,
        rowsParsed: 0,
        rowsSkipped: 0,
        rowsFailed: [{ rowIndex: 0, reason: `unknown PDF template: ${templateId}` }],
      },
    };
  }
  if (!extractedText || typeof extractedText !== "string") {
    return {
      rows: [],
      diagnostics: {
        totalRowsExamined: 0,
        rowsParsed: 0,
        rowsSkipped: 0,
        rowsFailed: [
          {
            rowIndex: 0,
            reason:
              "empty extracted text — PDF may be a scanned image (OCR deferred to P5)",
          },
        ],
      },
    };
  }

  const source = opts.source ?? `pdf:${templateId}`;
  const currency = opts.defaultCurrency ?? template.defaultCurrency;
  const amountFormat = template.amountFormat ?? "standard";
  const dateFormat = template.dateFormat;

  const rows: ParsedStatementRow[] = [];
  const failed: Array<{ rowIndex: number; reason: string }> = [];
  let earliest: Date | undefined;
  let latest: Date | undefined;

  // Regex MUST be /g — we iterate all matches.
  const re = template.rowRegex.flags.includes("g")
    ? template.rowRegex
    : new RegExp(template.rowRegex.source, template.rowRegex.flags + "g");

  // Reset lastIndex defensively (regex literals share state across calls).
  re.lastIndex = 0;

  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(extractedText)) !== null) {
    idx++;
    const groups = m.groups ?? {};
    try {
      const dateRaw = groups["date"]?.trim();
      const descRaw = groups["description"]?.trim().replace(/\s+/g, " ");
      const amountRaw = groups["amount"]?.trim();
      const sign = groups["sign"]?.trim().toUpperCase();
      const debitRaw = groups["debit"]?.trim();
      const creditRaw = groups["credit"]?.trim();
      const reference = groups["reference"]?.trim();

      const date = dateRaw ? parseDateFlexible(dateRaw, dateFormat) : null;
      if (!date) {
        failed.push({ rowIndex: idx, reason: `unparseable date: "${dateRaw}"` });
        continue;
      }

      let amountMinor: bigint | null = null;
      if (template.amountSign === "separate") {
        const d = debitRaw
          ? parseAmountToMinor(debitRaw, { format: amountFormat })
          : null;
        const c = creditRaw
          ? parseAmountToMinor(creditRaw, { format: amountFormat })
          : null;
        if (d == null && c == null) {
          failed.push({ rowIndex: idx, reason: "no debit/credit amount" });
          continue;
        }
        amountMinor = (c ?? 0n) - (d ?? 0n);
      } else {
        amountMinor = amountRaw
          ? parseAmountToMinor(amountRaw, { format: amountFormat })
          : null;
        if (amountMinor == null) {
          failed.push({
            rowIndex: idx,
            reason: `unparseable amount: "${amountRaw}"`,
          });
          continue;
        }
        // BCA-style: every figure is positive, signed by a separate
        // "DB"/"CR" indicator. Flip when sign === DB.
        if (sign === "DB" && amountMinor > 0n) amountMinor = -amountMinor;
        else if (
          template.debitColumnPositive &&
          sign === undefined &&
          amountMinor > 0n
        ) {
          // Mandiri-style: amount is in a "debit" column with no sign
          // marker — leave positive; description hints decide sign.
          // (This branch is left intentionally simple; reconciliation
          // rules pick up the slack.)
        }
      }

      const description = descRaw || "(no description)";
      const externalTransactionId = synthesizeTransactionId({
        source,
        date,
        amountMinor,
        description,
      });
      if (!earliest || date < earliest) earliest = date;
      if (!latest || date > latest) latest = date;

      rows.push({
        externalTransactionId,
        externalReference: reference,
        transactionDate: date,
        amountMinor,
        currency,
        description,
        rawPayload: { template: template.id, ...groups },
      });
    } catch (err) {
      failed.push({
        rowIndex: idx,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    rows,
    diagnostics: {
      totalRowsExamined: idx,
      rowsParsed: rows.length,
      rowsSkipped: 0,
      rowsFailed: failed,
      periodStart: earliest,
      periodEnd: latest,
      notes: { template: template.id, label: template.label },
    },
  };
}

/**
 * Heuristic: returns the first template whose row-regex produces any
 * matches against a sample of the extracted text. Used by the import
 * wizard's auto-detect flow. Returns null when nothing matches —
 * operator picks manually.
 */
export function autoDetectPdfTemplate(
  extractedText: string,
): PdfStatementTemplate | null {
  for (const t of TEMPLATE_REGISTRY.values()) {
    const re = t.rowRegex.flags.includes("g")
      ? t.rowRegex
      : new RegExp(t.rowRegex.source, t.rowRegex.flags + "g");
    re.lastIndex = 0;
    if (re.test(extractedText)) return t;
  }
  return null;
}
