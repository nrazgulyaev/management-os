"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createChangeOrder } from "@/lib/development/server/change-orders/change-order-actions";

const INIT_TYPES = [
  "arconique_internal",
  "buyer_request",
  "investor_request",
  "vendor_proposed",
  "regulatory",
  "design_correction",
  "site_condition",
] as const;

export function ChangeOrderForm({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState("");
  const [initiatedBy, setInitiatedBy] = useState<typeof INIT_TYPES[number]>(
    "arconique_internal",
  );
  const [costImpact, setCostImpact] = useState("0");
  const [scheduleDays, setScheduleDays] = useState("0");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !reason.trim() || !scope.trim()) {
      setError("Title, reason, and scope description are required");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createChangeOrder({
          title,
          projectId,
          initiatedByType: initiatedBy,
          reason,
          scopeChangeDescription: scope,
          costImpactMinor: BigInt(Math.round(Number(costImpact) * 100)),
          scheduleImpactDays: Math.round(Number(scheduleDays)),
        });
        router.push(
          `/development-os/projects/${projectSlug}/change-orders/${out.changeOrderCode}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-2xl">
      <label className="block text-sm">
        <span className="text-ink-secondary">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add second-floor balcony to Villa A"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="text-ink-secondary">Initiator</span>
        <select
          value={initiatedBy}
          onChange={(e) => setInitiatedBy(e.target.value as typeof initiatedBy)}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        >
          {INIT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-ink-secondary">Reason</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Why is this change being requested?"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="text-ink-secondary">Scope change description</span>
        <textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          rows={4}
          placeholder="What exactly changes? Drawings, materials, deliverables..."
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">
            Cost impact (USD, can be negative)
          </span>
          <input
            type="number"
            step="0.01"
            value={costImpact}
            onChange={(e) => setCostImpact(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">
            Schedule impact (days, can be negative)
          </span>
          <input
            type="number"
            step="1"
            value={scheduleDays}
            onChange={(e) => setScheduleDays(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
          />
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Submit change order
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-[11px] text-ink-tertiary">
        Lands in 'requested' status — operator review + approval flow uses
        Stage 4.A approval_thresholds matrix.
      </p>
    </form>
  );
}
