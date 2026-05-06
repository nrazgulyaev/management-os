"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deactivateCostCategory } from "@/lib/development/server/cost-category-actions";

/**
 * Per-row archive button. Two-click confirm to avoid accidental
 * deactivation. Refuses if active children exist (server enforces).
 */
export function CostCategoryArchiveButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isActive) return null;

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        data-testid="cost-category-archive-trigger"
        onClick={() => {
          setError(null);
          if (!confirming) {
            setConfirming(true);
            return;
          }
          startTransition(async () => {
            try {
              await deactivateCostCategory(id);
              setConfirming(false);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Archive failed");
            }
          });
        }}
      >
        {pending ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Archive className="w-3 h-3" />
        )}
        <span className="ml-1 text-[11px]">
          {confirming ? "Confirm" : "Archive"}
        </span>
      </Button>
      {confirming && !pending && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
        >
          <span className="text-[11px]">Cancel</span>
        </Button>
      )}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}
