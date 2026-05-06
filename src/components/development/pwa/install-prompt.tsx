"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "arconique-install-dismissed-at";
const SUPPRESS_FOR_DAYS = 14;

/**
 * Stage 5.I — Captures `beforeinstallprompt` and renders an install
 * CTA. Dismissal sticks in localStorage for ~2 weeks so the prompt
 * doesn't badger.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissedAtStr = window.localStorage.getItem(STORAGE_KEY);
    if (dismissedAtStr) {
      const ts = Number(dismissedAtStr);
      if (
        Number.isFinite(ts) &&
        Date.now() - ts < SUPPRESS_FOR_DAYS * 24 * 60 * 60 * 1000
      ) {
        setHidden(true);
        return;
      }
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (hidden || !event) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm rounded-md border border-line-soft bg-surface shadow-lg p-4 flex items-start gap-3">
      <Download className="w-5 h-5 text-info shrink-0" strokeWidth={1.75} />
      <div className="flex-1">
        <div className="text-sm font-medium">Install Arconique</div>
        <p className="text-xs text-ink-secondary leading-relaxed mt-1">
          Add to your home screen for offline site reports + push alerts.
        </p>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={async () => {
              await event.prompt();
              await event.userChoice;
              setEvent(null);
            }}
            className="px-3 py-1.5 text-xs rounded bg-info text-white"
          >
            Install
          </button>
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
              setHidden(true);
            }}
            className="px-3 py-1.5 text-xs rounded bg-muted text-ink-secondary"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
          setHidden(true);
        }}
        className="text-ink-tertiary hover:text-ink"
      >
        <X className="w-4 h-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
