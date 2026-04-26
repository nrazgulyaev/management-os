"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { seedDefaultJobDefinitionsAction } from "@/features/jobs/actions";

export function SeedDefaultJobDefinitionsButton() {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);

  const onClick = () => {
    setInfo(null);
    startTransition(async () => {
      const res = await seedDefaultJobDefinitionsAction(null, new FormData());
      if (!res.ok) {
        setInfo(res.error);
        return;
      }
      setInfo(
        res.inserted === 0
          ? "Definitions already up to date."
          : `Seeded ${res.inserted} job definition${res.inserted === 1 ? "" : "s"}.`,
      );
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" disabled={pending} onClick={onClick}>
        Seed default jobs
      </Button>
      {info && <span className="text-xs text-ink-tertiary">{info}</span>}
    </div>
  );
}
