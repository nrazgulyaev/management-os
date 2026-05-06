"use client";

import { useEffect } from "react";

/**
 * Stage 5.I — Registers the hand-rolled service worker on the client.
 *
 * Mounted from the development-app layout so registration only happens
 * inside the Development OS surface (avoid registering on public pages).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "test") return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.log("[PWA] Service worker registered", registration.scope);
        }
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.warn("[PWA] Service worker registration failed", error);
      });
  }, []);

  return null;
}
