"use client";

import { useState, useTransition } from "react";
import { Loader2, Check, X, Files, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approveExtractionAsTransaction,
  rejectExtraction,
  markExtractionDuplicate,
  regenerateExtraction,
} from "@/lib/development/server/document-extraction-actions";

/**
 * HITL review panel for an `ai_document_extractions` row. For receipts
 * and invoices: pre-fills a transaction form from the extracted data;
 * operator confirms or overrides each field then clicks Approve to
 * create the `dev_transactions` row. Other types (delivery notes,
 * contracts) are rendered read-only with reject/duplicate actions —
 * the create-delivery flow is deferred (see Stage 3.C deferred list
 * in architecture.md).
 */

const QUALITY_TONE = {
  high: "success",
  medium: "info",
  low: "warning",
  unreadable: "danger",
} as const;

const STATUS_TONE = {
  pending_review: "info",
  approved: "success",
  edited_approved: "success",
  rejected: "warning",
  duplicate: "neutral",
  superseded: "neutral",
} as const;

export interface ExtractionPanelProp {
  id: string;
  documentType: string;
  status:
    | "pending_review"
    | "approved"
    | "edited_approved"
    | "rejected"
    | "duplicate"
    | "superseded";
  detectedLanguage: string | null;
  detectedQuality: string | null;
  extractedData: Record<string, unknown>;
  suggestedVendorId: string | null;
  suggestedProjectId: string | null;
  suggestedCategoryId: string | null;
  vendorMatchConfidence: string | null;
  categoryMatchConfidence: string | null;
  reasoning: string;
  ambiguities: string[] | null;
  rejectionReason: string | null;
  createdTransactionId: string | null;
  generatedAt: Date | string;
  reviewedAt: Date | string | null;
}

export function ExtractionReviewPanel({
  extraction,
  bankAccounts,
  categories,
}: {
  extraction: ExtractionPanelProp;
  bankAccounts: Array<{ id: string; label: string; currency: string }>;
  categories: Array<{ id: string; label: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const ed = extraction.extractedData ?? {};
  const isTransactionType =
    extraction.documentType === "receipt" ||
    extraction.documentType === "invoice";

  // Form state pre-filled from extraction.
  const initialAmount =
    typeof ed.amount === "number"
      ? String(ed.amount)
      : typeof ed.amount === "string"
        ? ed.amount
        : "";
  const initialCurrency =
    typeof ed.currency === "string" ? ed.currency : "USD";
  const initialDate =
    typeof ed.transaction_date === "string"
      ? ed.transaction_date
      : new Date().toISOString().slice(0, 10);
  const initialVendor =
    typeof ed.vendor_name === "string" ? ed.vendor_name : "";

  const [bankAccountId, setBankAccountId] = useState(
    bankAccounts[0]?.id ?? "",
  );
  const [direction, setDirection] = useState<"inflow" | "outflow">("outflow");
  const [categoryId, setCategoryId] = useState<string>(
    extraction.suggestedCategoryId ?? "",
  );
  const [amount, setAmount] = useState(initialAmount);
  const [currency, setCurrency] = useState<
    "USD" | "IDR" | "RUB" | "EUR" | "USDT" | "CNY"
  >(
    ["USD", "IDR", "RUB", "EUR", "USDT", "CNY"].includes(initialCurrency)
      ? (initialCurrency as "USD" | "IDR" | "RUB" | "EUR" | "USDT" | "CNY")
      : "USD",
  );
  const [fxRate, setFxRate] = useState(currency === "USD" ? "1" : "");
  const [txnDate, setTxnDate] = useState(initialDate);
  const [counterpartyName, setCounterpartyName] = useState(initialVendor);
  const [externalRef, setExternalRef] = useState(
    typeof ed.invoice_number === "string" ? ed.invoice_number : "",
  );
  const [description, setDescription] = useState(
    initialVendor
      ? `${extraction.documentType} from ${initialVendor}`
      : `${extraction.documentType} extraction`,
  );

  const isFinal =
    extraction.status === "approved" ||
    extraction.status === "edited_approved" ||
    extraction.status === "rejected" ||
    extraction.status === "duplicate" ||
    extraction.status === "superseded";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[extraction.status]}>
          {extraction.status}
        </Badge>
        {extraction.detectedQuality && (
          <Badge
            tone={
              QUALITY_TONE[
                extraction.detectedQuality as keyof typeof QUALITY_TONE
              ] ?? "neutral"
            }
          >
            Quality: {extraction.detectedQuality}
          </Badge>
        )}
        {extraction.detectedLanguage && (
          <span className="text-[11px] text-ink-tertiary">
            Language: {extraction.detectedLanguage.toUpperCase()}
          </span>
        )}
      </div>

      <div className="rounded-md border border-line-soft bg-muted/20 p-3">
        <h5 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-1">
          AI reasoning
        </h5>
        <p className="text-sm text-ink-secondary whitespace-pre-wrap">
          {extraction.reasoning}
        </p>
      </div>

      <div className="rounded-md border border-line-soft p-3 space-y-2">
        <h5 className="text-xs uppercase tracking-wide text-ink-tertiary">
          Raw extracted fields
        </h5>
        <pre className="text-xs bg-muted/30 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(extraction.extractedData, null, 2)}
        </pre>
      </div>

      {isTransactionType && !isFinal && (
        <div className="rounded-md border border-line-soft p-4 space-y-3">
          <h4 className="text-sm font-medium">
            Confirm transaction fields (operator overrides win)
          </h4>
          {extraction.suggestedCategoryId && (
            <p className="text-xs text-ink-tertiary">
              AI suggested category match confidence:{" "}
              {extraction.categoryMatchConfidence != null
                ? `${(Number(extraction.categoryMatchConfidence) * 100).toFixed(0)}%`
                : "—"}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Field label="Bank account">
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="rounded border border-line-soft p-1.5 text-sm w-full"
              >
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Direction">
              <select
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as "inflow" | "outflow")
                }
                className="rounded border border-line-soft p-1.5 text-sm w-full"
              >
                <option value="outflow">Outflow (money out)</option>
                <option value="inflow">Inflow (money in)</option>
              </select>
            </Field>
            <Field label="Category">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="rounded border border-line-soft p-1.5 text-sm w-full"
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <select
                value={currency}
                onChange={(e) =>
                  setCurrency(
                    e.target.value as
                      | "USD"
                      | "IDR"
                      | "RUB"
                      | "EUR"
                      | "USDT"
                      | "CNY",
                  )
                }
                className="rounded border border-line-soft p-1.5 text-sm w-full"
              >
                {["USD", "IDR", "RUB", "EUR", "USDT", "CNY"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (major units, e.g. 5000000 = Rp 5M)">
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded border border-line-soft p-1.5 text-sm w-full"
              />
            </Field>
            <Field label="FX rate to USD (1 if currency=USD)">
              <input
                type="text"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                placeholder="e.g. 15800.00"
                className="rounded border border-line-soft p-1.5 text-sm w-full"
              />
            </Field>
            <Field label="Transaction date">
              <input
                type="date"
                value={txnDate}
                onChange={(e) => setTxnDate(e.target.value)}
                className="rounded border border-line-soft p-1.5 text-sm w-full"
              />
            </Field>
            <Field label="Counterparty name">
              <input
                type="text"
                value={counterpartyName}
                onChange={(e) => setCounterpartyName(e.target.value)}
                className="rounded border border-line-soft p-1.5 text-sm w-full"
              />
            </Field>
            <Field label="External reference (invoice no.)">
              <input
                type="text"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                className="rounded border border-line-soft p-1.5 text-sm w-full"
              />
            </Field>
            <Field label="Description">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded border border-line-soft p-1.5 text-sm w-full"
              />
            </Field>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      {!isFinal && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line-soft">
          {isTransactionType && (
            <Button
              size="sm"
              disabled={
                pending ||
                !bankAccountId ||
                Number(amount) <= 0 ||
                Number(fxRate) <= 0
              }
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    const minor = BigInt(
                      Math.round(
                        Number(amount) *
                          (currency === "USDT" ? 1_000_000 : 100),
                      ),
                    ).toString();
                    await approveExtractionAsTransaction({
                      extractionId: extraction.id,
                      transaction: {
                        bankAccountId,
                        direction,
                        categoryId: categoryId || null,
                        projectId: extraction.suggestedProjectId,
                        amountMinor: minor,
                        currency,
                        fxRateAtTransaction: fxRate,
                        transactionDate: txnDate,
                        description,
                        counterpartyName: counterpartyName || null,
                        externalReference: externalRef || null,
                      },
                    });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Approve failed");
                  }
                });
              }}
            >
              <Check className="w-3 h-3 mr-1" /> Approve & create transaction
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await regenerateExtraction({ extractionId: extraction.id });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Regenerate failed");
                }
              });
            }}
          >
            <RefreshCcw className="w-3 h-3 mr-1" /> Re-extract
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await markExtractionDuplicate({
                    extractionId: extraction.id,
                  });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Mark dup failed");
                }
              });
            }}
          >
            <Files className="w-3 h-3 mr-1" /> Mark duplicate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowReject((v) => !v)}
          >
            <X className="w-3 h-3 mr-1" /> Reject
          </Button>
          {showReject && (
            <div className="w-full mt-2 flex items-center gap-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason (≥3 chars)"
                className="flex-1 rounded border border-line-soft p-2 text-sm"
              />
              <Button
                size="sm"
                disabled={pending || rejectReason.trim().length < 3}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      await rejectExtraction({
                        extractionId: extraction.id,
                        reason: rejectReason,
                      });
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Reject failed",
                      );
                    }
                  });
                }}
              >
                Confirm reject
              </Button>
            </div>
          )}
        </div>
      )}

      {isFinal && (
        <div className="text-[11px] text-ink-tertiary border-t border-line-soft pt-2">
          {extraction.reviewedAt
            ? `Reviewed ${new Date(extraction.reviewedAt).toLocaleString()}`
            : "Final state"}
          {extraction.createdTransactionId
            ? ` — linked to transaction ${extraction.createdTransactionId.slice(0, 8)}`
            : ""}
          {extraction.rejectionReason
            ? ` — rejection reason: ${extraction.rejectionReason}`
            : ""}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ink-tertiary">{label}</span>
      {children}
    </label>
  );
}
