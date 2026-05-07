/**
 * Stage 6.P3.G — Auto-matching engine.
 *
 * Pure helpers — no I/O. Given a single bank transaction + a candidate
 * pool of invoices/transactions, produce a ranked list of match
 * candidates with confidence scores. The service layer reads these
 * and decides:
 *   - confidence >= 0.95 → auto-match (set match_status='auto_matched')
 *   - 0.5 ≤ confidence < 0.95 → flag for manual review
 *   - confidence < 0.5 → no candidate, leave unmatched
 *
 * Each match strategy contributes a partial signal — total
 * confidence is the weighted sum, capped at 1.0.
 */

import { descriptionSimilarity } from "./description-matcher";

export interface MatchableBankTransaction {
  amountMinor: bigint;
  currency: string;
  transactionDate: Date;
  description: string;
  counterpartyName?: string;
}

export interface MatchableInvoice {
  id: string;
  amountMinor: bigint;
  currency: string;
  /** Issued / due date — whichever is closer to when payment lands. */
  date: Date;
  /** Vendor / customer name on the invoice. */
  counterparty?: string;
  /** Free-form description / memo. */
  description?: string;
}

export interface MatchableTransaction {
  id: string;
  amountMinor: bigint;
  currency: string;
  date: Date;
  description?: string;
}

export interface MatchCandidate {
  type: "invoice" | "transaction";
  id: string;
  confidence: number;
  matchReasons: string[];
}

export interface MatcherOptions {
  /** Acceptable difference in days between bank tx date and invoice
   *  date. Default 7. */
  dateToleranceDays?: number;
  /** Required minimum confidence to surface as a candidate. Default
   *  0.5 (everything below is dropped). */
  minConfidence?: number;
}

/**
 * Match a bank transaction against a pool of invoices + reconciled
 * transactions. Returns sorted (highest confidence first), capped to
 * the top 10 candidates.
 */
export function findMatches(
  bankTx: MatchableBankTransaction,
  candidates: {
    invoices?: MatchableInvoice[];
    transactions?: MatchableTransaction[];
  },
  options: MatcherOptions = {},
): MatchCandidate[] {
  const minConfidence = options.minConfidence ?? 0.5;
  const out: MatchCandidate[] = [];

  for (const inv of candidates.invoices ?? []) {
    const c = scoreInvoiceMatch(bankTx, inv, options);
    if (c.confidence >= minConfidence) {
      out.push({
        type: "invoice",
        id: inv.id,
        confidence: c.confidence,
        matchReasons: c.matchReasons,
      });
    }
  }
  for (const t of candidates.transactions ?? []) {
    const c = scoreTransactionMatch(bankTx, t, options);
    if (c.confidence >= minConfidence) {
      out.push({
        type: "transaction",
        id: t.id,
        confidence: c.confidence,
        matchReasons: c.matchReasons,
      });
    }
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, 10);
}

interface ScoreResult {
  confidence: number;
  matchReasons: string[];
}

export function scoreInvoiceMatch(
  bankTx: MatchableBankTransaction,
  inv: MatchableInvoice,
  options: MatcherOptions = {},
): ScoreResult {
  // Currency mismatch → can't match. Multi-currency reconciliation
  // happens through P3.D Wise's FX-leg projection, not here.
  if (bankTx.currency !== inv.currency) {
    return { confidence: 0, matchReasons: [] };
  }

  let confidence = 0;
  const reasons: string[] = [];

  // 1. Amount match (weight: 0.50). Compare absolute values — an
  // outgoing payment matches an outgoing invoice.
  const txAbs = bankTx.amountMinor < 0n ? -bankTx.amountMinor : bankTx.amountMinor;
  const invAbs = inv.amountMinor < 0n ? -inv.amountMinor : inv.amountMinor;
  if (txAbs === invAbs) {
    confidence += 0.5;
    reasons.push("amount_exact");
  }

  // 2. Date match (weight: 0.25). Within tolerance window.
  const days = daysBetween(bankTx.transactionDate, inv.date);
  const tol = options.dateToleranceDays ?? 7;
  if (days === 0) {
    confidence += 0.25;
    reasons.push("date_exact");
  } else if (days <= tol) {
    confidence += 0.15 * (1 - days / tol);
    reasons.push(`date_within_${days}d`);
  }

  // 3. Counterparty match (weight: 0.15) — only when both sides have
  // a counterparty name.
  if (bankTx.counterpartyName && inv.counterparty) {
    const sim = descriptionSimilarity(
      bankTx.counterpartyName,
      inv.counterparty,
    );
    if (sim > 0.7) {
      confidence += 0.15;
      reasons.push(`counterparty_similar_${sim.toFixed(2)}`);
    } else if (sim > 0.4) {
      confidence += 0.05;
      reasons.push(`counterparty_partial_${sim.toFixed(2)}`);
    }
  }

  // 4. Description / memo match (weight: 0.10).
  if (inv.description) {
    const sim = descriptionSimilarity(bankTx.description, inv.description);
    if (sim > 0.6) {
      confidence += 0.1;
      reasons.push(`description_similar_${sim.toFixed(2)}`);
    } else if (sim > 0.3) {
      confidence += 0.04;
      reasons.push(`description_partial_${sim.toFixed(2)}`);
    }
  }

  return { confidence: Math.min(1, confidence), matchReasons: reasons };
}

export function scoreTransactionMatch(
  bankTx: MatchableBankTransaction,
  other: MatchableTransaction,
  options: MatcherOptions = {},
): ScoreResult {
  if (bankTx.currency !== other.currency) {
    return { confidence: 0, matchReasons: [] };
  }
  let confidence = 0;
  const reasons: string[] = [];

  // For transaction-to-transaction: amount must match exactly + date
  // tolerance applies. Useful for matching a cleared bank entry
  // against a manual ledger entry.
  if (bankTx.amountMinor === other.amountMinor) {
    confidence += 0.6;
    reasons.push("amount_exact");
  } else if (
    bankTx.amountMinor === -other.amountMinor &&
    other.amountMinor !== 0n
  ) {
    // Inverse sign — typical for "this is the bank side of a manual
    // ledger entry". Lower confidence.
    confidence += 0.3;
    reasons.push("amount_inverse");
  }

  const days = daysBetween(bankTx.transactionDate, other.date);
  const tol = options.dateToleranceDays ?? 3;
  if (days === 0) {
    confidence += 0.3;
    reasons.push("date_exact");
  } else if (days <= tol) {
    confidence += 0.2 * (1 - days / tol);
    reasons.push(`date_within_${days}d`);
  }

  if (other.description) {
    const sim = descriptionSimilarity(bankTx.description, other.description);
    if (sim > 0.6) {
      confidence += 0.1;
      reasons.push(`description_similar_${sim.toFixed(2)}`);
    }
  }
  return { confidence: Math.min(1, confidence), matchReasons: reasons };
}

/** Absolute days between two dates (UTC). */
export function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Convenience: returns the match-status the service layer should set
 * given a top-confidence candidate.
 */
export function decideMatchStatus(
  topConfidence: number,
):
  | "auto_matched"
  | "partial_match"
  | "unmatched" {
  if (topConfidence >= 0.95) return "auto_matched";
  if (topConfidence >= 0.5) return "partial_match";
  return "unmatched";
}
