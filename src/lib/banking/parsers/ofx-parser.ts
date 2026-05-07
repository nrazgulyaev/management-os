/**
 * Stage 6.P3.B — OFX (Open Financial Exchange) parser.
 *
 * OFX is the most widely-supported export format among consumer +
 * business banks. Versions 1.x are SGML; 2.x is XML. We handle both
 * by detecting the SGML preamble and rewriting it into XML before
 * handing to fast-xml-parser.
 *
 * Pure helper — no I/O. Lazy-loads `fast-xml-parser` (already in deps
 * via Stage 6.P1.B) so initial bundle stays small.
 *
 * Mapping (OFX → ParsedStatementRow):
 *   STMTTRN.FITID         → externalTransactionId (stable, idempotent)
 *   STMTTRN.DTPOSTED      → transactionDate
 *   STMTTRN.DTUSER        → valueDate (when present)
 *   STMTTRN.TRNAMT        → amountMinor (sign convention preserved)
 *   STMTTRN.NAME / MEMO   → description (NAME wins, MEMO appended)
 *   STMTTRN.CHECKNUM      → externalReference
 *   BANKMSGSRSV1.STMTRS.CURDEF → currency (account-level)
 */

import {
  parseAmountToMinor,
  type ParseResult,
  type ParsedStatementRow,
} from "./types";

let parserModule: typeof import("fast-xml-parser") | null = null;

async function loadParser() {
  if (parserModule) return parserModule;
  parserModule = await import("fast-xml-parser");
  return parserModule;
}

export function __resetOfxParserCacheForTests() {
  parserModule = null;
}

// ---------------------------------------------------------------------------
// SGML → XML preprocessing (OFX 1.x compat)
// ---------------------------------------------------------------------------

/**
 * OFX 1.x ships SGML-style with unclosed tags ("<DTPOSTED>20260507"
 * without `</DTPOSTED>`). The widely-used trick: close any line that
 * starts with `<TAG>value` and lacks a closing tag.
 *
 * Also strips the OFX header block (everything before the first
 * `<OFX>` element).
 */
export function ofxSgmlToXml(content: string): string {
  // Drop the SGML header block. Look for "<OFX>" and keep everything
  // from there onward.
  const ofxStart = content.indexOf("<OFX>");
  const body = ofxStart >= 0 ? content.slice(ofxStart) : content;

  // For each line, if it matches `<TAG>value` (no closing tag on the
  // same line) — close it. Lines that already have a closing tag pass
  // through.
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      // Already balanced or pure closing — leave alone.
      const openCount = (trimmed.match(/<[^/!?][^>]*>/g) ?? []).length;
      const closeCount = (trimmed.match(/<\/[^>]+>/g) ?? []).length;
      if (openCount === 0 || openCount === closeCount) return line;
      // Auto-close: `<TAG>value` → `<TAG>value</TAG>` when there's
      // exactly one open + zero closes + a non-empty value.
      if (openCount === 1 && closeCount === 0) {
        const m = trimmed.match(/^<([A-Za-z0-9_.]+)>(.+)$/);
        if (m) {
          const [, tag, value] = m;
          // Don't auto-close if `value` itself contains another tag
          // (rare nested case).
          if (!/[<>]/.test(value)) {
            const indent = line.match(/^\s*/)?.[0] ?? "";
            return `${indent}<${tag}>${value}</${tag}>`;
          }
        }
      }
      return line;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// parseOfxStatement
// ---------------------------------------------------------------------------

export async function parseOfxStatement(
  content: string,
): Promise<ParseResult> {
  if (!content || typeof content !== "string") {
    return {
      rows: [],
      diagnostics: {
        totalRowsExamined: 0,
        rowsParsed: 0,
        rowsSkipped: 0,
        rowsFailed: [{ rowIndex: 0, reason: "empty OFX content" }],
      },
    };
  }
  const xml = ofxSgmlToXml(content);
  const { XMLParser } = await loadParser();
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseAttributeValue: false,
    parseTagValue: false,
    ignoreDeclaration: true,
    ignorePiTags: true,
    trimValues: true,
  });
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch (err) {
    return {
      rows: [],
      diagnostics: {
        totalRowsExamined: 0,
        rowsParsed: 0,
        rowsSkipped: 0,
        rowsFailed: [
          {
            rowIndex: 0,
            reason: `OFX parse error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      },
    };
  }

  // Walk OFX → BANKMSGSRSV1 → STMTTRNRS → STMTRS → BANKTRANLIST → STMTTRN.
  // CCSTMTRS path is the analog for credit-card statements.
  const ofx = (parsed["OFX"] ?? {}) as Record<string, unknown>;
  const bankMsg = (ofx["BANKMSGSRSV1"] ?? {}) as Record<string, unknown>;
  const ccMsg = (ofx["CREDITCARDMSGSRSV1"] ?? {}) as Record<string, unknown>;

  const stmts: Array<Record<string, unknown>> = [
    ...collectStatements(bankMsg, "STMTTRNRS", "STMTRS"),
    ...collectStatements(ccMsg, "CCSTMTTRNRS", "CCSTMTRS"),
  ];

  if (stmts.length === 0) {
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
              "no statement (BANKMSGSRSV1/STMTTRNRS or CREDITCARDMSGSRSV1/CCSTMTTRNRS) found",
          },
        ],
      },
    };
  }

  const rows: ParsedStatementRow[] = [];
  const failed: Array<{ rowIndex: number; reason: string }> = [];
  let earliest: Date | undefined;
  let latest: Date | undefined;
  let total = 0;
  let skipped = 0;

  for (const stmt of stmts) {
    const currency = (stmt["CURDEF"] as string) || "USD";
    const tranList = (stmt["BANKTRANLIST"] ?? {}) as Record<string, unknown>;
    const txns = toArray(tranList["STMTTRN"]);
    total += txns.length;
    txns.forEach((t, idx) => {
      try {
        const fitid = pickStr(t, "FITID");
        const dtPosted = pickStr(t, "DTPOSTED");
        const dtUser = pickStr(t, "DTUSER");
        const trnAmt = pickStr(t, "TRNAMT");
        const name = pickStr(t, "NAME");
        const memo = pickStr(t, "MEMO");
        const checkNum = pickStr(t, "CHECKNUM");

        if (!fitid || !dtPosted || trnAmt == null) {
          skipped++;
          return;
        }
        const date = ofxDate(dtPosted);
        const valueDate = dtUser ? ofxDate(dtUser) ?? undefined : undefined;
        if (!date) {
          failed.push({
            rowIndex: idx + 1,
            reason: `unparseable DTPOSTED: ${dtPosted}`,
          });
          return;
        }
        const amount = parseAmountToMinor(trnAmt, { format: "standard" });
        if (amount == null) {
          failed.push({
            rowIndex: idx + 1,
            reason: `unparseable TRNAMT: ${trnAmt}`,
          });
          return;
        }
        const descParts = [name, memo].filter((s): s is string => !!s);
        const description = descParts.join(" — ") || "(no description)";
        if (!earliest || date < earliest) earliest = date;
        if (!latest || date > latest) latest = date;
        rows.push({
          externalTransactionId: fitid,
          externalReference: checkNum,
          transactionDate: date,
          valueDate,
          amountMinor: amount,
          currency,
          description,
          rawPayload: t,
        });
      } catch (err) {
        failed.push({
          rowIndex: idx + 1,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return {
    rows,
    diagnostics: {
      totalRowsExamined: total,
      rowsParsed: rows.length,
      rowsSkipped: skipped,
      rowsFailed: failed,
      periodStart: earliest,
      periodEnd: latest,
      notes: { statementCount: stmts.length },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectStatements(
  parent: Record<string, unknown>,
  trnrsKey: string,
  rsKey: string,
): Array<Record<string, unknown>> {
  const trnrs = toArray(parent[trnrsKey]);
  const out: Array<Record<string, unknown>> = [];
  for (const t of trnrs) {
    const rs = (t[rsKey] ?? {}) as Record<string, unknown>;
    if (rs && typeof rs === "object") out.push(rs);
  }
  return out;
}

function toArray(v: unknown): Array<Record<string, unknown>> {
  if (!v) return [];
  if (Array.isArray(v))
    return v.filter(
      (x): x is Record<string, unknown> => x != null && typeof x === "object",
    );
  if (typeof v === "object")
    return [v as Record<string, unknown>];
  return [];
}

function pickStr(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

/** OFX date formats: "YYYYMMDD" or "YYYYMMDDHHMMSS" (with optional
 *  millisecond suffix + timezone). We extract the date part. */
export function ofxDate(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const yy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return new Date(Date.UTC(yy, mm - 1, dd));
}
