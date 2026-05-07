"use client";

/**
 * Stage 7.F.D.1 — Generate RFQ from BOQ items.
 *
 * Lightweight wrapper around `generatePurchaseRequestsFromBoqAction`.
 * The detail page passes the list of BOQ item ids visible on screen;
 * we materialize one draft purchase request per item.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generatePurchaseRequestsFromBoqAction } from "@/lib/development/server/procurement/procurement-actions";

interface Props {
  boqItemIds: string[];
}

export function GenerateRfqFromBoqButton({ boqItemIds }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (boqItemIds.length === 0) return null;

  const handleClick = () => {
    setError(null);
    setSuccess(null);
    const requiredBy = window.prompt(
      `Generate ${boqItemIds.length} draft purchase requests from these BOQ items?\n\nRequired-by date (YYYY-MM-DD):`,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    );
    if (!requiredBy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requiredBy)) {
      setError("Date must be YYYY-MM-DD.");
      return;
    }
    startTransition(async () => {
      const result = await generatePurchaseRequestsFromBoqAction({
        boqItemIds,
        requiredByDate: requiredBy,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        `Created ${result.createdCount} draft request(s). Codes: ${result.requestCodes.slice(0, 3).join(", ")}${result.requestCodes.length > 3 ? "…" : ""}`,
      );
      // Refresh + redirect to PR list.
      router.push("/development-os/procurement/purchase-requests");
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={handleClick}
      >
        {pending ? "Creating…" : `Generate ${boqItemIds.length} draft RFQ${boqItemIds.length === 1 ? "" : "s"}`}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
      {success && <span className="text-xs text-emerald-700">{success}</span>}
    </div>
  );
}
