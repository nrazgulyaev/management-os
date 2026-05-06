"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markUtilityPaymentPaidAction } from "@/features/utilities/actions";

export function MarkPaidButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      {info && !error && <span className="text-xs text-ink-tertiary">{info}</span>}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          setError(null);
          setInfo(null);
          startTransition(async () => {
            const fd = new FormData();
            fd.set("id", id);
            const res = await markUtilityPaymentPaidAction(null, fd);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setInfo(
              res.locked
                ? "paid · period locked, expense skipped"
                : res.expenseLineId
                  ? "paid · expense linked"
                  : "paid",
            );
          });
        }}
      >
        {pending ? "Saving…" : "Mark paid"}
      </Button>
    </span>
  );
}
