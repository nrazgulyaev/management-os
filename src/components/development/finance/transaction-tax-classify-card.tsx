"use client";

import { useState, useTransition } from "react";
import { Loader2, Receipt, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { classifyTransactionTax } from "@/lib/development/server/tax/tax-actions";

/**
 * Bookkeeper-critical UI: per-transaction tax classification.
 *
 * Renders on the transaction detail page. Three sections:
 *   - Status pill (Classified / Reviewed / Unclassified / Tax-exempt /
 *     Missing-doc).
 *   - Tax type dropdown filtered to active types.
 *   - Auto-computed tax amount with formula tooltip; operator can
 *     override (which flips status to 'reviewed').
 *
 * Tax document upload is deferred to the existing document upload
 * pipeline — operator pastes the document_id once uploaded.
 */

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  classified: "success",
  reviewed: "info",
  unclassified: "danger",
  tax_exempt: "neutral",
  flagged_missing_doc: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  classified: "🟢 Classified",
  reviewed: "🟡 Reviewed",
  unclassified: "🔴 Unclassified",
  tax_exempt: "⚪ Tax-exempt",
  flagged_missing_doc: "🟠 Missing doc",
};

export interface TaxTypeOption {
  id: string;
  typeKey: string;
  displayName: string;
  ratePercentage: string;
  isIncludedInAmount: boolean;
}

export interface TransactionTaxState {
  transactionId: string;
  amountMinor: string;
  currency: string;
  taxTypeId: string | null;
  taxAmountMinor: string | null;
  isTaxIncluded: boolean | null;
  taxClassificationStatus: string;
  taxDocumentId: string | null;
}

export function TransactionTaxClassifyCard({
  transaction,
  taxTypes,
}: {
  transaction: TransactionTaxState;
  taxTypes: TaxTypeOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [taxTypeId, setTaxTypeId] = useState<string>(
    transaction.taxTypeId ?? "",
  );
  const [taxAmount, setTaxAmount] = useState<string>(
    transaction.taxAmountMinor != null
      ? (Number(transaction.taxAmountMinor) / 100).toString()
      : "",
  );
  const [taxDocumentId, setTaxDocumentId] = useState<string>(
    transaction.taxDocumentId ?? "",
  );
  const [touchedAmount, setTouchedAmount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = taxTypes.find((t) => t.id === taxTypeId);
  const amountMajor = Number(transaction.amountMinor) / 100;

  // Auto-compute tax amount when type changes (unless operator already
  // overrode). Tax-included formula: amount * rate / (100 + rate).
  // Tax-added formula: amount * rate / 100.
  function computeTaxAmount(rate: number, isIncluded: boolean): number {
    if (isIncluded) return (amountMajor * rate) / (100 + rate);
    return (amountMajor * rate) / 100;
  }

  function onSelectType(id: string) {
    setTaxTypeId(id);
    setError(null);
    if (!id) {
      setTaxAmount("");
      setTouchedAmount(false);
      return;
    }
    const t = taxTypes.find((x) => x.id === id);
    if (!t) return;
    if (!touchedAmount) {
      const computed = computeTaxAmount(
        Number(t.ratePercentage),
        t.isIncludedInAmount,
      );
      setTaxAmount(computed.toFixed(2));
    }
  }

  function onAmountChange(v: string) {
    setTaxAmount(v);
    setTouchedAmount(true);
  }

  function classify(targetStatus: "classified" | "reviewed" | "tax_exempt") {
    setError(null);
    startTransition(async () => {
      try {
        await classifyTransactionTax({
          transactionId: transaction.transactionId,
          taxTypeId: targetStatus === "tax_exempt" ? null : taxTypeId || null,
          taxAmountMinor:
            targetStatus === "tax_exempt"
              ? null
              : taxAmount
                ? BigInt(Math.round(Number(taxAmount) * 100)).toString()
                : null,
          isTaxIncluded: selectedType?.isIncludedInAmount ?? false,
          status: targetStatus,
          taxDocumentId: taxDocumentId || undefined,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Classify failed");
      }
    });
  }

  const isTerminalState =
    transaction.taxClassificationStatus === "tax_exempt";
  const missingDoc =
    transaction.taxClassificationStatus === "classified" &&
    !transaction.taxDocumentId;

  return (
    <div className="rounded-md border border-line-soft bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-ink-secondary" />
          <h4 className="text-sm font-medium">Tax classification</h4>
          <Badge
            tone={STATUS_TONE[transaction.taxClassificationStatus] ?? "neutral"}
          >
            {STATUS_LABEL[transaction.taxClassificationStatus] ??
              transaction.taxClassificationStatus}
          </Badge>
          {missingDoc && (
            <Badge tone="warning">
              <AlertCircle className="w-3 h-3 mr-1" />
              Tax doc missing
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Tax type
          </span>
          <select
            value={taxTypeId}
            onChange={(e) => onSelectType(e.target.value)}
            className="rounded border border-line-soft p-1.5 text-sm w-full"
          >
            <option value="">— None / Tax-exempt —</option>
            {taxTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName} ({t.ratePercentage}%
                {t.isIncludedInAmount ? ", incl." : ", added"})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span
            className="text-[11px] uppercase tracking-wide text-ink-tertiary"
            title={
              selectedType?.isIncludedInAmount
                ? `Formula: amount × ${selectedType.ratePercentage} / (100 + ${selectedType.ratePercentage})`
                : selectedType
                  ? `Formula: amount × ${selectedType.ratePercentage} / 100`
                  : "Tax amount in major units (auto-computed when type selected)"
            }
          >
            Tax amount ({transaction.currency}, major units)
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={taxAmount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="0.00"
            className="rounded border border-line-soft p-1.5 text-sm w-full"
            disabled={!taxTypeId}
          />
          {touchedAmount && taxTypeId && (
            <span className="text-[11px] text-warning">
              Manual override — saving will flip status to &lsquo;reviewed&rsquo;
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Tax document UUID (paste from documents library)
          </span>
          <input
            type="text"
            value={taxDocumentId}
            onChange={(e) => setTaxDocumentId(e.target.value)}
            placeholder="optional — required for classified transactions"
            className="rounded border border-line-soft p-1.5 text-xs w-full font-mono"
          />
        </label>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line-soft">
        <Button
          size="sm"
          disabled={pending || !taxTypeId || isTerminalState}
          onClick={() =>
            classify(touchedAmount ? "reviewed" : "classified")
          }
        >
          {pending ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : null}
          {touchedAmount ? "Save (mark reviewed)" : "Classify"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => classify("tax_exempt")}
        >
          Mark tax-exempt
        </Button>
      </div>

      <div className="text-[11px] text-ink-tertiary border-t border-line-soft pt-2">
        Tip: filter the transactions list by status to find unclassified
        items. Tax types are managed at{" "}
        <a
          href="/development-os/finance/tax-types"
          className="text-info hover:underline"
        >
          /finance/tax-types
        </a>
        .
      </div>
    </div>
  );
}
