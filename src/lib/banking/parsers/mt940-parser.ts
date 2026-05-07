/**
 * Stage 6.P3.B — SWIFT MT940 statement parser.
 *
 * MT940 ("Customer Statement Message") is the SWIFT FIN format used
 * by most European corporate banks for daily statements. The format
 * is a sequence of `:TAG:value` lines, where:
 *
 *   :20:  Reference         — statement reference
 *   :25:  Account ID
 *   :28C: Statement number  — sequence + page
 *   :60F: Opening balance   — date (YYMMDD), currency, amount
 *   :61:  Statement line    — value-date, entry-date, sign, amount,
 *                             type, refs, narrative (one txn per :61:)
 *   :86:  Information       — additional narrative for the preceding :61:
 *   :62F: Closing balance
 *
 * We extract one ParsedStatementRow per :61: + :86: pair.
 *
 * Pure helper — no I/O. No external deps; the format is easy to
 * tokenize line-by-line.
 *
 * Reference: SWIFT MT940 Message Standards Release 2024.
 */

import {
  parseAmountToMinor,
  synthesizeTransactionId,
  type ParseResult,
  type ParsedStatementRow,
} from "./types";

// ---------------------------------------------------------------------------
// parseMt940Statement
// ---------------------------------------------------------------------------

export function parseMt940Statement(content: string): ParseResult {
  if (!content || typeof content !== "string") {
    return emptyResult("empty MT940 content");
  }

  // Tokenize: a "tag block" is a line beginning with `:NNN:` plus any
  // continuation lines until the next `:` line. Continuation lines are
  // common on :86: information tags.
  const tags = tokenizeTags(content);

  let currency = "EUR";
  let accountId: string | undefined;
  const rows: ParsedStatementRow[] = [];
  const failed: Array<{ rowIndex: number; reason: string }> = [];
  let earliest: Date | undefined;
  let latest: Date | undefined;

  // Pair :61: with the immediately-following :86:.
  let pendingTxn: { tag: string; body: string } | null = null;
  let txnIndex = 0;

  for (const t of tags) {
    if (t.tag === "25") {
      accountId = t.body.trim();
      continue;
    }
    if (t.tag.startsWith("60")) {
      // 60F / 60M opening balance — extract currency.
      const m = t.body.match(/^[CD](\d{6})([A-Z]{3})/);
      if (m) currency = m[2];
      continue;
    }
    if (t.tag.startsWith("62")) {
      // Closing balance — useful for diagnostics, not for rows.
      continue;
    }
    if (t.tag === "61") {
      // Flush any pending unfinished txn first (no :86: follow-up).
      if (pendingTxn) {
        flushTxn(pendingTxn, undefined);
      }
      pendingTxn = { tag: t.tag, body: t.body };
      continue;
    }
    if (t.tag === "86" && pendingTxn) {
      flushTxn(pendingTxn, t.body);
      pendingTxn = null;
      continue;
    }
  }
  // Final pending txn.
  if (pendingTxn) flushTxn(pendingTxn, undefined);

  function flushTxn(txn: { body: string }, info: string | undefined) {
    txnIndex++;
    try {
      const parsed = parseStatementLine(txn.body);
      if (!parsed) {
        failed.push({
          rowIndex: txnIndex,
          reason: `unparseable :61: line: "${txn.body}"`,
        });
        return;
      }
      const description = (info ?? "").replace(/\s+/g, " ").trim() ||
        parsed.narrative ||
        "(no description)";
      const externalTransactionId =
        parsed.bankReference ||
        parsed.customerReference ||
        synthesizeTransactionId({
          source: `mt940${accountId ? ":" + accountId : ""}`,
          date: parsed.valueDate,
          amountMinor: parsed.amountMinor,
          description,
        });
      if (!earliest || parsed.valueDate < earliest) earliest = parsed.valueDate;
      if (!latest || parsed.valueDate > latest) latest = parsed.valueDate;
      rows.push({
        externalTransactionId,
        externalReference: parsed.customerReference,
        transactionDate: parsed.valueDate,
        valueDate: parsed.valueDate,
        bookingDate: parsed.entryDate ?? undefined,
        amountMinor: parsed.amountMinor,
        currency,
        description,
        rawPayload: {
          tag61: txn.body,
          tag86: info,
          accountId,
        },
      });
    } catch (err) {
      failed.push({
        rowIndex: txnIndex,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    rows,
    diagnostics: {
      totalRowsExamined: txnIndex,
      rowsParsed: rows.length,
      rowsSkipped: 0,
      rowsFailed: failed,
      periodStart: earliest,
      periodEnd: latest,
      notes: { accountId, currency },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyResult(reason: string): ParseResult {
  return {
    rows: [],
    diagnostics: {
      totalRowsExamined: 0,
      rowsParsed: 0,
      rowsSkipped: 0,
      rowsFailed: [{ rowIndex: 0, reason }],
    },
  };
}

interface TagToken {
  tag: string;
  body: string;
}

export function tokenizeTags(content: string): TagToken[] {
  const lines = content.split(/\r?\n/);
  const out: TagToken[] = [];
  let current: TagToken | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const m = line.match(/^:(\d{2}[A-Z]?):(.*)$/);
    if (m) {
      if (current) out.push(current);
      current = { tag: m[1], body: m[2] };
    } else if (current) {
      // Continuation line (only on :86: in practice).
      current.body += "\n" + line;
    }
  }
  if (current) out.push(current);
  return out;
}

interface Mt940StatementLine {
  valueDate: Date;
  entryDate: Date | null;
  amountMinor: bigint;
  /** The customer-side ref (after `//`). */
  customerReference?: string;
  /** Bank-side ref (between NS3 and `//`). */
  bankReference?: string;
  narrative?: string;
}

/**
 * :61: format:
 *   YYMMDD          — value date
 *   [MMDD]          — optional entry date
 *   D|C|RD|RC       — debit / credit / reverse-debit / reverse-credit
 *   [funds code]    — optional 1 alpha char
 *   amount          — N..15d (decimal comma)
 *   transaction type — N3 (e.g. NTRF, NDIV)
 *   [bankRef]//[custRef]
 *   [\nnarrative]
 *
 * Example: 2605070507C1234,56NTRFNONREF//BANKREF
 */
export function parseStatementLine(body: string): Mt940StatementLine | null {
  // Strip continuation newlines for header parsing.
  const flat = body.replace(/\s+/g, " ").trim();
  // YYMMDD value date (first 6 digits).
  const m = flat.match(
    /^(\d{6})(\d{4})?(RD|RC|D|C)([A-Z])?([\d,]+)(?:N\w{3})?(.*)$/,
  );
  if (!m) return null;
  const [, valDateStr, entryDateStr, sign, , amountStr, rest] = m;
  const valueDate = parseYymmdd(valDateStr);
  if (!valueDate) return null;
  const entryDate = entryDateStr
    ? parseEntryDate(valueDate, entryDateStr)
    : null;
  const absAmount = parseAmountToMinor(amountStr, { format: "european" });
  if (absAmount == null) return null;
  const isDebit = sign === "D" || sign === "RD";
  const amountMinor = isDebit ? -absAmount : absAmount;

  // Refs after the type code: "NONREF//BANKREF\nnarrative"
  let customerReference: string | undefined;
  let bankReference: string | undefined;
  let narrative: string | undefined;
  const refsAndNarrative = rest.trim();
  if (refsAndNarrative) {
    const slashIdx = refsAndNarrative.indexOf("//");
    if (slashIdx >= 0) {
      customerReference =
        refsAndNarrative.slice(0, slashIdx).trim() || undefined;
      bankReference = refsAndNarrative.slice(slashIdx + 2).trim() || undefined;
    } else {
      customerReference = refsAndNarrative;
    }
    if (customerReference?.toUpperCase() === "NONREF") customerReference = undefined;
  }
  return {
    valueDate,
    entryDate,
    amountMinor,
    customerReference,
    bankReference,
    narrative,
  };
}

function parseYymmdd(s: string): Date | null {
  if (!s || s.length !== 6) return null;
  const yy = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const dd = Number(s.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  // Banking convention: 70-99 → 1970-1999, 00-69 → 2000-2069.
  const yyyy = yy < 70 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

function parseEntryDate(valueDate: Date, mmdd: string): Date | null {
  if (mmdd.length !== 4) return null;
  const mm = Number(mmdd.slice(0, 2));
  const dd = Number(mmdd.slice(2, 4));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  // Entry date inherits the year from value date, with a wrap to the
  // previous year when entry month > value month (December postings
  // booked in January).
  let year = valueDate.getUTCFullYear();
  if (mm > valueDate.getUTCMonth() + 1) year -= 1;
  return new Date(Date.UTC(year, mm - 1, dd));
}
