"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { generateDueMaintenanceTasksAction } from "@/features/maintenance-intelligence/actions";

export function GenerateDuePlansButton() {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      {info && !error && (
        <span className="text-xs text-ink-tertiary">{info}</span>
      )}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          setInfo(null);
          startTransition(async () => {
            const fd = new FormData();
            const res = await generateDueMaintenanceTasksAction(null, fd);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setInfo(`generated ${res.generated ?? 0}`);
          });
        }}
      >
        {pending ? "Generating…" : "Generate due tasks"}
      </Button>
    </span>
  );
}
