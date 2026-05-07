/**
 * Stage 6.P3.C — Revolut → BankTransactionRecord projection.
 *
 * Pure helpers — no I/O. Take a Revolut transaction JSON object and
 * produce one ParsedStatementRow per leg (multi-currency transfers
 * have 2 legs — one per side of the FX swap).
 *
 * Sign convention: Revolut already signs amounts (positive = credit,
 * negative = debit). We pass it through unchanged.
 */

import {
  parseAmountToMinor,
  type ParsedStatementRow,
} from "../../parsers/types";
import type { RevolutTransaction, RevolutTransactionLeg } from "./client";

/**
 * Project one Revolut transaction into one or more
 * `ParsedStatementRow`s — one per leg.
 *
 * For single-leg transactions (most card payments + simple transfers),
 * the array has length 1. For FX transactions Revolut returns 2 legs
 * (debit on the source wallet, credit on the target wallet); each
 * lands as its own row keyed by `${id}:${leg_id}` so they stay
 * idempotent across re-imports.
 */
export function projectRevolutTransaction(
  txn: RevolutTransaction,
  opts: { defaultAccountId?: string } = {},
): ParsedStatementRow[] {
  if (!txn || !txn.id || !Array.isArray(txn.legs)) return [];

  // Pick the most-meaningful date — completed_at when present, else
  // created_at. Both come back as ISO 8601 strings.
  const dateStr = txn.completed_at ?? txn.created_at;
  const transactionDate = dateStr ? new Date(dateStr) : null;
  if (!transactionDate || Number.isNaN(transactionDate.getTime())) return [];

  const valueDate = txn.completed_at
    ? new Date(txn.completed_at)
    : undefined;
  const isPending = txn.state === "pending" || txn.state === "processing";

  const merchantName = txn.merchant?.name;
  const merchantCountry = txn.merchant?.country;
  const reference = txn.reference;

  const rows: ParsedStatementRow[] = [];
  for (const leg of txn.legs) {
    if (!leg || typeof leg.amount !== "number" || !leg.currency) continue;
    if (
      opts.defaultAccountId &&
      leg.account_id &&
      leg.account_id !== opts.defaultAccountId
    ) {
      // Filter to a single account when requested — used by
      // `RevolutProvider.fetchTransactions(accountId, …)` to avoid
      // double-counting an FX swap that touches two accounts owned by
      // the same org.
      continue;
    }
    rows.push(projectLeg(txn, leg, {
      transactionDate,
      valueDate: valueDate && Number.isNaN(valueDate.getTime())
        ? undefined
        : valueDate,
      isPending,
      merchantName,
      merchantCountry,
      reference,
    }));
  }
  return rows;
}

function projectLeg(
  txn: RevolutTransaction,
  leg: RevolutTransactionLeg,
  ctx: {
    transactionDate: Date;
    valueDate?: Date;
    isPending: boolean;
    merchantName?: string;
    merchantCountry?: string;
    reference?: string;
  },
): ParsedStatementRow {
  // Revolut amounts come back as decimal numbers — convert via
  // toString() so we exercise the same parseAmountToMinor pipeline as
  // the CSV / OFX / MT940 parsers (consistent rounding semantics).
  const amountStr = String(leg.amount);
  const amountMinor = parseAmountToMinor(amountStr, { format: "standard" });
  if (amountMinor == null) {
    // Defensive — should never trip given the Revolut contract, but if
    // it does we return a row with amount=0 and let the import
    // pipeline flag it. Returning null here would silently drop the
    // row.
    return baseRow(txn, leg, ctx, 0n);
  }
  return baseRow(txn, leg, ctx, amountMinor);
}

function baseRow(
  txn: RevolutTransaction,
  leg: RevolutTransactionLeg,
  ctx: {
    transactionDate: Date;
    valueDate?: Date;
    isPending: boolean;
    merchantName?: string;
    merchantCountry?: string;
    reference?: string;
  },
  amountMinor: bigint,
): ParsedStatementRow {
  // Multi-leg → suffix leg_id to keep externalTransactionId unique
  // across legs of the same Revolut transaction.
  const externalTransactionId =
    txn.legs.length > 1 ? `${txn.id}:${leg.leg_id}` : txn.id;

  // FX detail: Revolut populates `bill_amount` + `bill_currency` on
  // the leg whose account currency differs from the merchant /
  // counterparty currency. The bill side is the original (pre-FX)
  // amount; the leg amount is what hit our wallet.
  let originalAmountMinor: bigint | undefined;
  let originalCurrency: string | undefined;
  let fxRate: number | undefined;
  if (
    typeof leg.bill_amount === "number" &&
    typeof leg.bill_currency === "string" &&
    leg.bill_currency !== leg.currency
  ) {
    const billStr = String(leg.bill_amount);
    const billMinor = parseAmountToMinor(billStr, { format: "standard" });
    if (billMinor != null) {
      originalAmountMinor = billMinor;
      originalCurrency = leg.bill_currency;
      // amount / bill_amount — both signed and in the same direction,
      // so the ratio is positive. Avoid divide-by-zero.
      if (leg.bill_amount !== 0) {
        fxRate = Math.abs(leg.amount / leg.bill_amount);
      }
    }
  }

  // Description priority: merchant name → leg description → reference
  // → transaction type. We don't blank out — every row gets some
  // description so the inbox stays human-readable.
  const descriptionParts = [
    ctx.merchantName,
    leg.description,
    ctx.reference,
  ].filter((s): s is string => !!s && s.trim().length > 0);
  const description = descriptionParts.length
    ? Array.from(new Set(descriptionParts)).join(" — ")
    : (txn.type ?? "(no description)");

  return {
    externalTransactionId,
    externalReference: ctx.reference,
    transactionDate: ctx.transactionDate,
    valueDate: ctx.valueDate,
    amountMinor,
    currency: leg.currency,
    originalAmountMinor,
    originalCurrency,
    fxRate,
    description,
    counterpartyName: leg.counterparty?.name,
    counterpartyAccount: leg.counterparty?.account_id,
    counterpartyCountry: ctx.merchantCountry,
    isPending: ctx.isPending,
    rawPayload: {
      transactionId: txn.id,
      type: txn.type,
      state: txn.state,
      legId: leg.leg_id,
      accountId: leg.account_id,
      reference: ctx.reference,
    },
  };
}

/**
 * Parse a list-transactions response body into projected rows.
 *
 * Returns `{rows, malformed}` so callers can decide whether a partial
 * response should fail the sync or proceed with what parsed.
 */
export function projectRevolutTransactions(
  body: string,
  opts: { defaultAccountId?: string } = {},
): { rows: ParsedStatementRow[]; malformed: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { rows: [], malformed: 0 };
  }
  if (!Array.isArray(parsed)) return { rows: [], malformed: 0 };
  const out: ParsedStatementRow[] = [];
  let malformed = 0;
  for (const t of parsed) {
    if (!t || typeof t !== "object") {
      malformed++;
      continue;
    }
    const projected = projectRevolutTransaction(t as RevolutTransaction, opts);
    if (projected.length === 0) malformed++;
    out.push(...projected);
  }
  return { rows: out, malformed };
}

/**
 * Parse a single account JSON into our BankBalance shape's minor-unit
 * inputs. Returns null when the body doesn't look like a Revolut
 * account.
 */
export function projectRevolutAccountBalance(
  body: string,
): { availableMinor: bigint; currency: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj["balance"] !== "number" || typeof obj["currency"] !== "string") {
    return null;
  }
  const minor = parseAmountToMinor(String(obj["balance"]), {
    format: "standard",
  });
  if (minor == null) return null;
  return { availableMinor: minor, currency: obj["currency"] };
}
