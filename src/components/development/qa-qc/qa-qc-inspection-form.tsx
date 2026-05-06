"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordQaQcInspection } from "@/lib/development/server/qa-qc/qa-qc-actions";

/**
 * Operator-side: record an inspection round. Result auto-transitions
 * the issue (passed → accepted, failed → rejected, partial_pass stays
 * for operator follow-up).
 */
export function QaQcInspectionForm({ issueId }: { issueId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"passed" | "failed" | "partial_pass">("passed");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const out = await recordQaQcInspection({
          issueId,
          result,
          resultNotes: notes || null,
        });
        setSuccess(
          `Inspection #${out.inspection.inspectionNumber} recorded. Status now '${out.newStatus}'.`,
        );
        setNotes("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Inspection failed");
      }
    });
  }

  const RESULT_BUTTONS = [
    {
      value: "passed" as const,
      label: "Passed",
      Icon: CheckCircle,
      tone: "bg-green-100 text-green-900",
    },
    {
      value: "failed" as const,
      label: "Failed (rework)",
      Icon: XCircle,
      tone: "bg-red-100 text-red-900",
    },
    {
      value: "partial_pass" as const,
      label: "Partial pass",
      Icon: AlertCircle,
      tone: "bg-amber-100 text-amber-900",
    },
  ];

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <div className="text-sm text-ink-secondary mb-2">Result</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {RESULT_BUTTONS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setResult(b.value)}
              className={`min-h-[44px] rounded text-sm font-medium ${b.tone} flex items-center justify-center gap-2 ${
                result === b.value
                  ? "ring-2 ring-offset-2 ring-stone-900"
                  : ""
              }`}
            >
              <b.Icon className="w-4 h-4" />
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block text-sm">
        <span className="text-ink-secondary">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Record inspection
      </Button>

      {error && <p className="text-xs text-danger">{error}</p>}
      {success && <p className="text-xs text-success">{success}</p>}
    </form>
  );
}
