"use client";

import { useTransition, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runJobManuallyAction } from "@/features/jobs/actions";

export function RunNowButton({
  jobKey,
  size = "sm",
  label = "Run now",
}: {
  jobKey: string;
  size?: "sm" | "md";
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setInfo(null);
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("jobKey", jobKey);
      const res = await runJobManuallyAction(null, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo(`${res.status ?? "ok"}: ${res.summary ?? ""}`);
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size={size} disabled={pending} onClick={onClick}>
        <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
        {label}
      </Button>
      {info && <span className="text-xs text-ink-tertiary truncate max-w-[400px]">{info}</span>}
      {error && <span className="text-xs text-danger truncate max-w-[400px]">{error}</span>}
    </div>
  );
}
