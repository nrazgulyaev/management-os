/**
 * Stage 6.P3.D — Wise statement → BankTransactionRecord projection.
 *
 * Pure helpers — no I/O. Wise's COMPACT statement format gives one
 * `transaction` per logical movement; FLAT splits FX legs across two
 * rows. Both shapes project cleanly into our normalized record type.
 *
 * Sign convention: Wise amounts in `transactions[].amount.value` are
 * already signed (positive = credit, negative = debit). We pass
 * through unchanged.
 */

import {
  parseAmountToMinor,
  type ParsedStatementRow,
} from "../../parsers/types";
import type {
  WiseBalance,
  WiseStatementResponse,
  WiseStatementRow,
} from "./client";

export function projectWiseStatementRow(
  row: WiseStatementRow,
  ctx: { defaultCurrency?: string } = {},
): ParsedStatementRow | null {
  if (!row || typeof row.amount?.value !== "number") return null;
  const transactionDate = new Date(row.date);
  if (Number.isNaN(transactionDate.getTime())) return null;

  const currency = row.amount.currency || ctx.defaultCurrency || "USD";
  const amountMinor = parseAmountToMinor(String(row.amount.value), {
    format: "standard",
  });
  if (amountMinor == null) return null;

  // FX detail when source/target differ.
  let originalAmountMinor: bigint | undefined;
  let originalCurrency: string | undefined;
  let fxRate: number | undefined;
  const ex = row.exchangeDetails ?? row.details;
  if (ex && typeof ex === "object") {
    const from = (ex as Record<string, unknown>)["fromAmount"] as
      | { value: number; currency: string }
      | undefined;
    const to = (ex as Record<string, unknown>)["toAmount"] as
      | { value: number; currency: string }
      | undefined;
    const rate = (ex as Record<string, unknown>)["rate"];
    if (from && to && from.currency !== to.currency) {
      const candidate = parseAmountToMinor(String(from.value), {
        format: "standard",
      });
      if (candidate != null) {
        originalAmountMinor = candidate;
        originalCurrency = from.currency;
        if (typeof rate === "number" && rate > 0) fxRate = rate;
      }
    }
  }

  // Description priority: details.description → details.note →
  // details.paymentReference → row.type → "(no description)".
  const descriptionParts = [
    row.details?.description,
    row.details?.note,
    row.details?.paymentReference,
  ].filter((s): s is string => !!s && s.trim().length > 0);
  const description = descriptionParts.length
    ? Array.from(new Set(descriptionParts)).join(" — ")
    : row.type || "(no description)";

  // Stable idempotency key — Wise gives `referenceNumber` on most
  // movements; for the few that don't, synthesize from date + amount
  // + description.
  const externalTransactionId =
    row.referenceNumber?.trim() ||
    `wise:${row.date}:${amountMinor.toString()}:${(description ?? "").slice(0, 24).replace(/\s+/g, "_")}`;

  return {
    externalTransactionId,
    externalReference: row.details?.paymentReference,
    transactionDate,
    valueDate: transactionDate,
    amountMinor,
    currency,
    originalAmountMinor,
    originalCurrency,
    fxRate,
    description,
    counterpartyName: row.details?.senderName,
    counterpartyAccount: row.details?.senderAccount,
    rawPayload: {
      type: row.type,
      details: row.details,
      runningBalance: row.runningBalance,
      referenceNumber: row.referenceNumber,
    },
  };
}

export function projectWiseStatement(
  body: string,
  ctx: { defaultCurrency?: string } = {},
): { rows: ParsedStatementRow[]; malformed: number; periodStart?: Date; periodEnd?: Date } {
  let parsed: WiseStatementResponse;
  try {
    parsed = JSON.parse(body) as WiseStatementResponse;
  } catch {
    return { rows: [], malformed: 0 };
  }
  if (!parsed || !Array.isArray(parsed.transactions)) {
    return { rows: [], malformed: 0 };
  }
  const rows: ParsedStatementRow[] = [];
  let malformed = 0;
  for (const t of parsed.transactions) {
    const projected = projectWiseStatementRow(t, ctx);
    if (projected) rows.push(projected);
    else malformed++;
  }
  const periodStart = parsed.query?.intervalStart
    ? new Date(parsed.query.intervalStart)
    : undefined;
  const periodEnd = parsed.query?.intervalEnd
    ? new Date(parsed.query.intervalEnd)
    : undefined;
  return { rows, malformed, periodStart, periodEnd };
}

/**
 * Extract the requested balance from a `listBalances` body. Wise
 * returns balances for every currency wallet under the profile;
 * callers pick by `currency` (the connection's stored currency).
 */
export function projectWiseBalance(
  body: string,
  currency: string,
): { availableMinor: bigint; ledgerMinor?: bigint; currency: string } | null {
  let parsed: WiseBalance[];
  try {
    parsed = JSON.parse(body) as WiseBalance[];
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const match = parsed.find(
    (b) => b && b.currency?.toUpperCase() === currency.toUpperCase(),
  );
  if (!match) return null;
  const amount = match.amount?.value;
  if (typeof amount !== "number") return null;
  const minor = parseAmountToMinor(String(amount), { format: "standard" });
  if (minor == null) return null;
  return {
    availableMinor: minor,
    ledgerMinor:
      typeof match.cashAmount?.value === "number"
        ? parseAmountToMinor(String(match.cashAmount.value), {
            format: "standard",
          }) ?? undefined
        : undefined,
    currency: match.currency,
  };
}
