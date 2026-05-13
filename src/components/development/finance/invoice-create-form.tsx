"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createInvoice } from "@/lib/development/server/invoices/invoice-actions";

/**
 * Multi-section invoice create form. Single page (no wizard) per
 * Stage 2.4.B convention. Lines array up to 20 entries; auto-computes
 * subtotal and grand total client-side for operator feedback. The
 * server `createInvoice` action does its own authoritative computation
 * from the lines — the form's totals are display-only.
 */

interface LineDraft {
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitPriceMajor: string;
  taxTypeId: string;
  taxAmountMajor: string;
  costCategoryId: string;
}

const emptyLine: LineDraft = {
  description: "",
  quantity: "1",
  unitOfMeasure: "",
  unitPriceMajor: "",
  taxTypeId: "",
  taxAmountMajor: "",
  costCategoryId: "",
};

export function InvoiceCreateForm({
  taxTypes,
  categories,
  onSuccess,
  onCancel,
}: {
  taxTypes: Array<{ id: string; displayName: string; ratePercentage: string }>;
  categories: Array<{ id: string; label: string }>;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceType, setInvoiceType] = useState<
    "payable" | "receivable" | "investor_call" | "internal"
  >("payable");
  const [vendorId, setVendorId] = useState("");
  const [buyerContactId, setBuyerContactId] = useState("");
  const [investorId, setInvestorId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState<"USD" | "IDR" | "RUB" | "EUR">("USD");
  const [paymentTerms, setPaymentTerms] = useState("NET 30");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }]);

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  }
  function addLine() {
    if (lines.length >= 20) return;
    setLines((prev) => [...prev, { ...emptyLine }]);
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  // Client-side totals for operator preview. Server recomputes
  // authoritatively from the same line data.
  const previewSubtotal = lines.reduce((s, l) => {
    const q = Number(l.quantity || 0);
    const p = Number(l.unitPriceMajor || 0);
    return s + Math.round(q * p * 100);
  }, 0);
  const previewTax = lines.reduce(
    (s, l) => s + Math.round(Number(l.taxAmountMajor || 0) * 100),
    0,
  );
  const previewTotal = previewSubtotal + previewTax;

  function validate(): string | null {
    if (!invoiceNumber.trim()) return "Invoice number required";
    if (!issueDate) return "Issue date required";
    if (!dueDate) return "Due date required";
    if (lines.length === 0) return "At least one line required";
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.description.trim()) return `Line ${i + 1}: description required`;
      if (Number(l.unitPriceMajor) <= 0)
        return `Line ${i + 1}: unit price must be > 0`;
    }
    if (invoiceType === "payable" && !vendorId.trim())
      return "Payable invoices require a vendor";
    if (invoiceType === "receivable" && !buyerContactId.trim() && !projectId.trim())
      return "Receivable invoices require a buyer contact or project";
    if (invoiceType === "investor_call" && !investorId.trim())
      return "Investor call invoices require an investor";
    return null;
  }

  function onSubmit() {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    startTransition(async () => {
      try {
        const out = await createInvoice({
          invoiceNumber,
          invoiceType,
          vendorId: vendorId.trim() || undefined,
          buyerContactId: buyerContactId.trim() || undefined,
          investorId: investorId.trim() || undefined,
          projectId: projectId.trim() || undefined,
          issueDate,
          dueDate,
          currency,
          paymentTerms,
          notes: notes.trim() || undefined,
          internalNotes: internalNotes.trim() || undefined,
          lines: lines.map((l, i) => ({
            lineNumber: i + 1,
            description: l.description,
            quantity: l.quantity || "1",
            unitOfMeasure: l.unitOfMeasure || undefined,
            unitPriceMinor: BigInt(
              Math.round(Number(l.unitPriceMajor) * 100),
            ).toString(),
            costCategoryId: l.costCategoryId.trim() || undefined,
            taxTypeId: l.taxTypeId.trim() || undefined,
            taxAmountMinor: l.taxAmountMajor
              ? BigInt(Math.round(Number(l.taxAmountMajor) * 100)).toString()
              : undefined,
          })),
        });
        if (onSuccess) onSuccess();
        else router.push(`/development-os/finance/invoices/${out.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Fieldset legend="Type & parties">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Invoice number">
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INV-2026-0001"
              className="rounded border border-line-soft p-1.5 text-sm w-full"
            />
          </Field>
          <Field label="Invoice type">
            <select
              value={invoiceType}
              onChange={(e) =>
                setInvoiceType(
                  e.target.value as
                    | "payable"
                    | "receivable"
                    | "investor_call"
                    | "internal",
                )
              }
              className="rounded border border-line-soft p-1.5 text-sm w-full"
            >
              <option value="payable">Payable (we owe vendor)</option>
              <option value="receivable">Receivable (buyer owes us)</option>
              <option value="investor_call">Investor call</option>
              <option value="internal">Internal</option>
            </select>
          </Field>
          <Field label="Vendor ID (UUID)">
            <input
              type="text"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              placeholder="optional — required for payable"
              className="rounded border border-line-soft p-1.5 text-xs w-full font-mono"
            />
          </Field>
          <Field label="Buyer contact ID (UUID)">
            <input
              type="text"
              value={buyerContactId}
              onChange={(e) => setBuyerContactId(e.target.value)}
              placeholder="optional — for receivable"
              className="rounded border border-line-soft p-1.5 text-xs w-full font-mono"
            />
          </Field>
          <Field label="Investor ID (UUID)">
            <input
              type="text"
              value={investorId}
              onChange={(e) => setInvestorId(e.target.value)}
              placeholder="optional — required for investor_call"
              className="rounded border border-line-soft p-1.5 text-xs w-full font-mono"
            />
          </Field>
          <Field label="Project ID (UUID)">
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="optional"
              className="rounded border border-line-soft p-1.5 text-xs w-full font-mono"
            />
          </Field>
        </div>
      </Fieldset>

      <Fieldset legend="Dates & currency">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="Issue date">
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="rounded border border-line-soft p-1.5 text-sm w-full"
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded border border-line-soft p-1.5 text-sm w-full"
            />
          </Field>
          <Field label="Currency">
            <select
              value={currency}
              onChange={(e) =>
                setCurrency(e.target.value as "USD" | "IDR" | "RUB" | "EUR")
              }
              className="rounded border border-line-soft p-1.5 text-sm w-full"
            >
              <option value="USD">USD</option>
              <option value="IDR">IDR</option>
              <option value="RUB">RUB</option>
              <option value="EUR">EUR</option>
            </select>
          </Field>
          <Field label="Payment terms">
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="rounded border border-line-soft p-1.5 text-sm w-full"
            />
          </Field>
        </div>
      </Fieldset>

      <Fieldset
        legend={`Lines (${lines.length}/20)`}
        action={
          <Button
            size="sm"
            variant="secondary"
            disabled={lines.length >= 20}
            onClick={addLine}
          >
            <Plus className="w-3 h-3 mr-1" /> Add line
          </Button>
        }
      >
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div
              key={i}
              className="rounded border border-line-soft bg-muted/20 p-3 grid grid-cols-1 md:grid-cols-12 gap-2"
            >
              <div className="md:col-span-4">
                <span className="text-[11px] text-ink-tertiary">
                  Description
                </span>
                <input
                  type="text"
                  value={l.description}
                  onChange={(e) =>
                    updateLine(i, { description: e.target.value })
                  }
                  className="rounded border border-line-soft p-1 text-sm w-full"
                />
              </div>
              <div className="md:col-span-1">
                <span className="text-[11px] text-ink-tertiary">Qty</span>
                <input
                  type="number"
                  step="0.01"
                  value={l.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  className="rounded border border-line-soft p-1 text-sm w-full"
                />
              </div>
              <div className="md:col-span-1">
                <span className="text-[11px] text-ink-tertiary">Unit</span>
                <input
                  type="text"
                  value={l.unitOfMeasure}
                  onChange={(e) =>
                    updateLine(i, { unitOfMeasure: e.target.value })
                  }
                  placeholder="ea"
                  className="rounded border border-line-soft p-1 text-sm w-full"
                />
              </div>
              <div className="md:col-span-2">
                <span className="text-[11px] text-ink-tertiary">
                  Unit price ({currency})
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.unitPriceMajor}
                  onChange={(e) =>
                    updateLine(i, { unitPriceMajor: e.target.value })
                  }
                  className="rounded border border-line-soft p-1 text-sm w-full"
                />
              </div>
              <div className="md:col-span-2">
                <span className="text-[11px] text-ink-tertiary">Tax type</span>
                <select
                  value={l.taxTypeId}
                  onChange={(e) =>
                    updateLine(i, { taxTypeId: e.target.value })
                  }
                  className="rounded border border-line-soft p-1 text-sm w-full"
                >
                  <option value="">—</option>
                  {taxTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName} ({t.ratePercentage}%)
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1">
                <span className="text-[11px] text-ink-tertiary">Tax amt</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.taxAmountMajor}
                  onChange={(e) =>
                    updateLine(i, { taxAmountMajor: e.target.value })
                  }
                  className="rounded border border-line-soft p-1 text-sm w-full"
                />
              </div>
              <div className="md:col-span-1 flex items-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeLine(i)}
                  disabled={lines.length === 1}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <div className="md:col-span-12">
                <span className="text-[11px] text-ink-tertiary">
                  Cost category ID (optional)
                </span>
                <select
                  value={l.costCategoryId}
                  onChange={(e) =>
                    updateLine(i, { costCategoryId: e.target.value })
                  }
                  className="rounded border border-line-soft p-1 text-xs w-full"
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </Fieldset>

      <Fieldset legend="Notes">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Notes (visible to vendor)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded border border-line-soft p-1.5 text-sm w-full"
            />
          </Field>
          <Field label="Internal notes (not visible)">
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={3}
              className="rounded border border-line-soft p-1.5 text-sm w-full"
            />
          </Field>
        </div>
      </Fieldset>

      <div className="rounded-md border border-line-soft bg-muted/30 p-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <span className="text-[11px] text-ink-tertiary">Subtotal</span>
          <div className="font-medium">
            {currency} {(previewSubtotal / 100).toFixed(2)}
          </div>
        </div>
        <div>
          <span className="text-[11px] text-ink-tertiary">Tax total</span>
          <div className="font-medium">
            {currency} {(previewTax / 100).toFixed(2)}
          </div>
        </div>
        <div>
          <span className="text-[11px] text-ink-tertiary">Grand total</span>
          <div className="font-medium text-lg">
            {currency} {(previewTotal / 100).toFixed(2)}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-2 pt-3 border-t border-line-soft">
        <Button onClick={onSubmit} disabled={pending}>
          {pending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          Create invoice
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function Fieldset({
  legend,
  action,
  children,
}: {
  legend: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line-soft p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs uppercase tracking-wide text-ink-tertiary">
          {legend}
        </h4>
        {action}
      </div>
      {children}
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
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}
