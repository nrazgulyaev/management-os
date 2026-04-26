"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { generateDuePreventiveTasksAction } from "@/features/operations/actions";
import { Sparkles } from "lucide-react";

export function GeneratePreventiveButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const onClick = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await generateDuePreventiveTasksAction();
      if (!res.ok) {
        setMessage(res.error);
      } else {
        const n = (res as { generated?: number }).generated ?? 0;
        setMessage(n > 0 ? `Generated ${n} task${n === 1 ? "" : "s"}.` : "Nothing due.");
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" disabled={pending} onClick={onClick}>
        <Sparkles className="w-4 h-4" strokeWidth={1.75} />
        Generate due tasks
      </Button>
      {message && <span className="text-xs text-ink-tertiary">{message}</span>}
    </div>
  );
}
