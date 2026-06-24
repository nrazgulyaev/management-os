"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setMaintenanceTemplateStatusAction } from "@/features/maintenance-intelligence/actions";

export function TemplateRowActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextStatus = status === "archived" ? "active" : "archived";
  const label = status === "archived" ? "Reactivate" : "Archive";

  const dispatch = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("status", nextStatus);
      const res = await setMaintenanceTemplateStatusAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="flex items-center justify-end gap-2 shrink-0">
      {error && <span className="text-xs text-danger">{error}</span>}
      <Button size="sm" variant="ghost" disabled={pending} onClick={dispatch}>
        {label}
      </Button>
    </div>
  );
}
