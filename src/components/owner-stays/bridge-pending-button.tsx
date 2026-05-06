"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bridgePendingOwnerStaysAction } from "@/features/owner-stays/finance-bridge-actions";

export function BridgePendingButton() {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
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
            const res = await bridgePendingOwnerStaysAction(null, fd);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setInfo(
              `checked ${res.checked ?? 0}, bridged ${res.bridged ?? 0}, skipped ${res.skipped ?? 0}`,
            );
          });
        }}
      >
        {pending ? "Bridging…" : "Bridge pending"}
      </Button>
    </div>
  );
}
