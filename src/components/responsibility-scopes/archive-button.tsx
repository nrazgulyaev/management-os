"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { archiveResponsibilityScopeAction } from "@/features/responsibility-scopes/actions";

export function ScopeArchiveButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const fd = new FormData();
            fd.set("id", id);
            const res = await archiveResponsibilityScopeAction(null, fd);
            if (!res.ok) setError(res.error);
          });
        }}
      >
        {pending ? "Archiving…" : "Archive"}
      </Button>
    </span>
  );
}
