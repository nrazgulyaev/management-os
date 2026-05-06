"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

type PermissionStatus = "default" | "granted" | "denied" | "unsupported";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const padded = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Stage 5.I — Asks the user for Notification permission, subscribes
 * to push, and persists the subscription server-side. Detects unsupported
 * browsers and renders a graceful disabled state.
 */
export function PushPermission() {
  const [status, setStatus] = useState<PermissionStatus>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    setStatus(Notification.permission as PermissionStatus);
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setStatus(perm as PermissionStatus);
      if (perm !== "granted") {
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const keyResp = await fetch("/api/push/vapid-public-key");
      if (!keyResp.ok) {
        setError("Push not configured on server");
        setBusy(false);
        return;
      }
      const { publicKey } = (await keyResp.json()) as { publicKey: string };
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
          .buffer as ArrayBuffer,
      });
      const subJson = sub.toJSON() as {
        endpoint: string;
        keys?: { p256dh?: string; auth?: string };
      };
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dhKey: subJson.keys?.p256dh ?? "",
          authKey: subJson.keys?.auth ?? "",
          deviceType: /Mobi/.test(navigator.userAgent) ? "mobile" : "desktop",
          enabledNotificationTypes: [],
        }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "subscribe failed");
    } finally {
      setBusy(false);
    }
  }

  if (status === "unsupported") {
    return (
      <div className="text-sm text-ink-tertiary inline-flex items-center gap-2">
        <BellOff className="w-4 h-4" strokeWidth={1.75} />
        Push notifications unsupported on this browser.
      </div>
    );
  }

  if (status === "granted") {
    return (
      <div className="text-sm text-success inline-flex items-center gap-2">
        <Bell className="w-4 h-4" strokeWidth={1.75} />
        Notifications enabled.
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="text-sm text-warning inline-flex items-center gap-2">
        <BellOff className="w-4 h-4" strokeWidth={1.75} />
        Notifications blocked. Enable from browser settings.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="px-3 py-1.5 text-sm rounded bg-info text-white disabled:opacity-60 inline-flex items-center gap-2"
      >
        <Bell className="w-4 h-4" strokeWidth={1.75} />
        {busy ? "Enabling…" : "Enable notifications"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
