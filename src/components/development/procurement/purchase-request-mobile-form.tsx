"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPurchaseRequest } from "@/lib/development/server/procurement/procurement-actions";

/**
 * Mobile-first purchase request form. Touch-friendly inputs (44px+
 * height), single-column layout below 768px (Tailwind `md:` prefix
 * for 2-column grid on tablet+). Color-coded urgency buttons.
 */

const URGENCY_OPTIONS = [
  { value: "low", label: "Low", color: "bg-stone-200 text-stone-700" },
  { value: "normal", label: "Normal", color: "bg-blue-100 text-blue-800" },
  { value: "high", label: "High", color: "bg-orange-100 text-orange-800" },
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-800" },
] as const;

const CATEGORY_OPTIONS = [
  "construction",
  "finishes",
  "electrical",
  "plumbing",
  "hvac",
  "landscaping",
  "fixtures",
  "tools",
  "consumables",
  "other",
];

export function PurchaseRequestMobileForm({
  projects,
  onSuccess,
  onCancel,
}: {
  projects: Array<{ id: string; name: string; slug: string }>;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [materialName, setMaterialName] = useState("");
  const [materialCategory, setMaterialCategory] = useState("construction");
  const [quantity, setQuantity] = useState("1");
  const [unitOfMeasure, setUnitOfMeasure] = useState("");
  const [reason, setReason] = useState("");
  const [requiredByDate, setRequiredByDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  );
  const [urgency, setUrgency] = useState<
    "low" | "normal" | "high" | "critical"
  >("normal");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [estimatedCurrency, setEstimatedCurrency] = useState("IDR");
  const [preferredSupplierId, setPreferredSupplierId] = useState("");
  const [notes, setNotes] = useState("");

  function validate(): string | null {
    if (!projectId) return "Project required";
    if (!materialName.trim()) return "Material name required";
    if (!quantity || Number(quantity) <= 0) return "Quantity must be > 0";
    if (!unitOfMeasure.trim()) return "Unit of measure required";
    if (!reason.trim()) return "Reason required";
    if (!requiredByDate) return "Required-by date required";
    return null;
  }

  function submit(target: "draft" | "submitted") {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    startTransition(async () => {
      try {
        const out = await createPurchaseRequest({
          projectId,
          materialName,
          materialCategory,
          quantity,
          unitOfMeasure,
          reason,
          requiredByDate,
          urgency,
          estimatedCostMinor: estimatedCost
            ? BigInt(Math.round(Number(estimatedCost) * 100)).toString()
            : undefined,
          estimatedCurrency,
          preferredSupplierId: preferredSupplierId.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        // Stage 4.A.4: status defaults to 'draft'. To submit, the
        // operator hits the detail page's "Submit for approval" button
        // (not implemented as a separate POST here to keep this form
        // single-purpose).
        if (target === "submitted") {
          // Best-effort: call transitionPurchaseRequest after creation
          // — failures don't roll back the create.
          // (Not exposed from client; defer to detail page.)
        }
        if (onSuccess) onSuccess();
        else router.push(`/development-os/procurement/purchase-requests/${out.requestCode}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Project */}
      <Field label="Project">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded border border-line-soft p-3 text-base w-full min-h-[44px]"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      {/* What's needed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Material name">
          <input
            type="text"
            value={materialName}
            onChange={(e) => setMaterialName(e.target.value)}
            placeholder="e.g. Cement (40kg bag)"
            className="rounded border border-line-soft p-3 text-base w-full min-h-[44px]"
          />
        </Field>
        <Field label="Category">
          <select
            value={materialCategory}
            onChange={(e) => setMaterialCategory(e.target.value)}
            className="rounded border border-line-soft p-3 text-base w-full min-h-[44px]"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity">
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="rounded border border-line-soft p-3 text-base w-full min-h-[44px]"
          />
        </Field>
        <Field label="Unit of measure">
          <input
            type="text"
            value={unitOfMeasure}
            onChange={(e) => setUnitOfMeasure(e.target.value)}
            placeholder="bag, m³, piece, sqm…"
            className="rounded border border-line-soft p-3 text-base w-full min-h-[44px]"
          />
        </Field>
      </div>

      {/* Why & when */}
      <Field label="Reason (why is this needed?)">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Tap mic for voice input on mobile…"
          className="rounded border border-line-soft p-3 text-base w-full"
        />
      </Field>
      <Field label="Required by">
        <input
          type="date"
          value={requiredByDate}
          onChange={(e) => setRequiredByDate(e.target.value)}
          className="rounded border border-line-soft p-3 text-base w-full min-h-[44px]"
        />
      </Field>

      <Field label="Urgency">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {URGENCY_OPTIONS.map((u) => (
            <button
              key={u.value}
              type="button"
              onClick={() => setUrgency(u.value)}
              className={`min-h-[44px] rounded-md font-medium text-sm transition-all ${
                urgency === u.value
                  ? `${u.color} ring-2 ring-stone-900`
                  : `${u.color} opacity-60`
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
      </Field>

      {/* Optional context */}
      <details className="rounded border border-line-soft p-3">
        <summary className="cursor-pointer text-sm text-ink-secondary">
          Optional context (estimated cost, supplier, notes)
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Estimated cost">
              <input
                type="number"
                step="0.01"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="optional"
                className="rounded border border-line-soft p-3 text-base w-full min-h-[44px]"
              />
            </Field>
            <Field label="Currency">
              <select
                value={estimatedCurrency}
                onChange={(e) => setEstimatedCurrency(e.target.value)}
                className="rounded border border-line-soft p-3 text-base w-full min-h-[44px]"
              >
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </Field>
          </div>
          <Field label="Preferred supplier ID (UUID, optional)">
            <input
              type="text"
              value={preferredSupplierId}
              onChange={(e) => setPreferredSupplierId(e.target.value)}
              className="rounded border border-line-soft p-3 text-xs w-full font-mono min-h-[44px]"
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded border border-line-soft p-3 text-base w-full"
            />
          </Field>
        </div>
      </details>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-col md:flex-row gap-2 pt-4 border-t border-line-soft">
        <Button
          onClick={() => submit("draft")}
          disabled={pending}
          variant="secondary"
          className="min-h-[44px]"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : null}
          Save as draft
        </Button>
        <Button
          onClick={() => submit("submitted")}
          disabled={pending}
          className="min-h-[44px]"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : null}
          Save (operator submits via detail page)
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
        )}
      </div>
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
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}
