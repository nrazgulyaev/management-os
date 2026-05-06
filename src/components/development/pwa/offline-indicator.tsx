"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { getQueueSize } from "@/lib/development/client/offline-queue";

/**
 * Stage 5.I — Offline + queue-state indicator.
 *
 * Shows:
 *   - "Offline" when navigator.onLine === false
 *   - "Syncing N…" when there are pending offline actions
 *   - hidden when online and queue empty
 *
 * Tucked into the dev-app header / shell.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => setOnline(navigator.onLine);
    apply();
    window.addEventListener("online", apply);
    window.addEventListener("offline", apply);
    return () => {
      window.removeEventListener("online", apply);
      window.removeEventListener("offline", apply);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const n = await getQueueSize();
        if (!cancelled) setPending(n);
      } catch {
        // IndexedDB unavailable — leave at 0.
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [online]);

  if (online && pending === 0) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1 text-xs text-ink-tertiary">
        <Wifi className="w-3.5 h-3.5" strokeWidth={1.75} />
        Online
      </span>
    );
  }

  if (!online) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-warning/15 text-warning">
        <WifiOff className="w-3.5 h-3.5" strokeWidth={1.75} />
        Offline {pending > 0 ? `· ${pending} queued` : ""}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-info/15 text-info">
      <RefreshCw className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
      Syncing {pending}…
    </span>
  );
}
