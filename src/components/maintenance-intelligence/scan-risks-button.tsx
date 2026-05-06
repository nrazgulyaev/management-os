"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { scanMaintenanceRisksServerAction } from "@/features/maintenance-intelligence/risk-actions";

export function ScanRisksButton() {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      {info && !error && <span className="text-xs text-ink-tertiary">{info}</span>}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          setInfo(null);
          startTransition(async () => {
            const fd = new FormData();
            const res = await scanMaintenanceRisksServerAction(null, fd);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            const total =
              (res.overdueMaintenance ?? 0) +
              (res.utilityLowBalance ?? 0) +
              (res.utilityCriticalBalance ?? 0) +
              (res.noRecentReading ?? 0) +
              (res.repeatedTicket ?? 0) +
              (res.upcomingGuestConflict ?? 0) +
              (res.arrivalNotReady ?? 0);
            setInfo(`scanned · ${total} risk(s)`);
          });
        }}
      >
        {pending ? "Scanning…" : "Scan risks"}
      </Button>
    </span>
  );
}
