"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  bridgeMaterialUsageForTaskAction,
  bridgeOneMaterialUsageAction,
  bridgePendingMaterialUsageAction,
} from "@/features/finance/material-usage-bridge-actions";

export function BridgePendingButton() {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const onClick = () => {
    setInfo(null);
    startTransition(async () => {
      const res = await bridgePendingMaterialUsageAction();
      if (!res.ok) {
        setInfo(res.error);
        return;
      }
      const r = res as { created?: number; skipped?: number; failed?: number };
      setInfo(
        `Bridged ${r.created ?? 0} usage row${r.created === 1 ? "" : "s"} · ${r.skipped ?? 0} skipped · ${r.failed ?? 0} failed.`,
      );
    });
  };
  return (
    <div className="flex items-center gap-3">
      <Button onClick={onClick} disabled={pending}>
        Bridge pending usage
      </Button>
      {info && <span className="text-xs text-ink-tertiary">{info}</span>}
    </div>
  );
}

export function BridgeForTaskButton({ taskId }: { taskId: string }) {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const onClick = () => {
    setInfo(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("taskId", taskId);
      const res = await bridgeMaterialUsageForTaskAction(null, fd);
      if (!res.ok) setInfo(res.error);
      else setInfo("Bridged.");
    });
  };
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={onClick}>
        Bridge to finance
      </Button>
      {info && <span className="text-xs text-ink-tertiary">{info}</span>}
    </div>
  );
}

export function BridgeOneUsageButton({ usageId }: { usageId: string }) {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const onClick = () => {
    setInfo(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("usageId", usageId);
      const res = await bridgeOneMaterialUsageAction(null, fd);
      if (!res.ok) setInfo(res.error);
      else setInfo("Bridged.");
    });
  };
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" disabled={pending} onClick={onClick}>
        Retry bridge
      </Button>
      {info && <span className="text-[11px] text-ink-tertiary">{info}</span>}
    </div>
  );
}
