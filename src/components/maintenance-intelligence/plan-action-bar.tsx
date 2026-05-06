"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  archiveVillaMaintenancePlanAction,
  generateMaintenanceTaskFromPlanAction,
  pauseVillaMaintenancePlanAction,
  suggestMaintenanceWindowsAction,
} from "@/features/maintenance-intelligence/actions";

export function PlanActionBar({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dispatch = (
    fn:
      | typeof suggestMaintenanceWindowsAction
      | typeof generateMaintenanceTaskFromPlanAction
      | typeof pauseVillaMaintenancePlanAction
      | typeof archiveVillaMaintenancePlanAction,
    extras?: Record<string, string>,
  ) => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("planId", id);
      if (extras) for (const [k, v] of Object.entries(extras)) fd.set(k, v);
      const res = await fn(null, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if ("suggestions" in res && res.suggestions !== undefined) {
        setInfo(`${res.suggestions} suggestion(s)`);
      } else if ("taskId" in res && res.taskId) {
        setInfo("task generated");
      } else {
        setInfo("done");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-1 flex-wrap">
        {status === "active" && (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                dispatch(suggestMaintenanceWindowsAction, { horizonDays: "14" })
              }
            >
              Refresh suggestions
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => dispatch(generateMaintenanceTaskFromPlanAction)}
            >
              Generate task
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => dispatch(pauseVillaMaintenancePlanAction)}
            >
              Pause
            </Button>
          </>
        )}
        {status !== "archived" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => dispatch(archiveVillaMaintenancePlanAction)}
          >
            Archive
          </Button>
        )}
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
      {info && !error && (
        <span className="text-xs text-ink-tertiary">{info}</span>
      )}
    </div>
  );
}
