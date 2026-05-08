"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Archive, ArchiveRestore } from "lucide-react";
import { ArchiveConfirmDialog } from "@/components/ui/primitives";
import type { ActionResult } from "@/features/projects/actions";

/**
 * Generic admin archive / restore button.
 *
 * Stage 10.E.7 — wrapped the destructive "Archive" path in
 * <ArchiveConfirmDialog> from the 10.D primitives. Restore is one
 * click (it's non-destructive). Archive opens the confirm dialog →
 * fires the action → surfaces inline error on failure.
 */
export function ArchiveButton({
  id,
  action,
  archived,
  entityName,
}: {
  id: string;
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  archived: boolean;
  /** Optional name for the confirm dialog body (e.g. villa code, project name). */
  entityName?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <span className="inline-flex items-center gap-2">
        {archived ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const fd = new FormData();
                fd.set("id", id);
                const res = await action(null, fd);
                if (!res.ok) setError(res.error);
              });
            }}
          >
            <ArchiveRestore className="w-3.5 h-3.5" strokeWidth={1.75} />
            {pending ? "Restoring…" : "Restore"}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => setConfirmOpen(true)}
          >
            <Archive className="w-3.5 h-3.5" strokeWidth={1.75} />
            {pending ? "Archiving…" : "Archive"}
          </Button>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </span>
      <ArchiveConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={async () => {
          const fd = new FormData();
          fd.set("id", id);
          const res = await action(null, fd);
          if (!res.ok) {
            setError(res.error);
            throw new Error(res.error);
          }
        }}
        entityName={entityName}
      />
    </>
  );
}
