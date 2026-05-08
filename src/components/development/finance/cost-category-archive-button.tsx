"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArchiveConfirmDialog } from "@/components/ui/primitives";
import { deactivateCostCategory } from "@/lib/development/server/cost-category-actions";

/**
 * Per-row cost-category archive button.
 *
 * Stage 10.E.7 — replaced the bespoke two-click confirm with the
 * standard <ArchiveConfirmDialog> primitive for consistency with
 * the rest of the codebase. Refuses if active children exist
 * (server enforces).
 */
export function CostCategoryArchiveButton({
  id,
  isActive,
  entityName,
}: {
  id: string;
  isActive: boolean;
  entityName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
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
          setConfirmOpen(true);
        }}
      >
        {pending ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Archive className="w-3 h-3" />
        )}
        <span className="ml-1 text-[11px]">Archive</span>
      </Button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
      <ArchiveConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={async () => {
          await new Promise<void>((resolve, reject) => {
            startTransition(async () => {
              try {
                await deactivateCostCategory(id);
                router.refresh();
                resolve();
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Archive failed";
                setError(msg);
                reject(new Error(msg));
              }
            });
          });
        }}
        entityName={entityName}
      />
    </span>
  );
}
