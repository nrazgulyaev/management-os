"use client";

import * as React from "react";
import { Copy, RefreshCw, Ban, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  rotateVillaIcalTokenAction,
  revokeVillaIcalTokenAction,
} from "@/features/integrations/calendar-export/actions";

/**
 * ICAL-EXPORT-1 — per-villa outbound feed manager (client island on the
 * calendar-feeds page). Generate/rotate shows the feed URL ONCE (only the
 * hash persists server-side); copy it into the OTA's "import calendar".
 * Revoke immediately 404s the old URL.
 */

export interface IcalExportRow {
  villaId: string;
  villaLabel: string;
  tokenPrefix: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
}

export function IcalExportManager({ rows }: { rows: IcalExportRow[] }) {
  const [pendingVilla, setPendingVilla] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState<{
    villaId: string;
    feedUrl: string;
  } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onRotate(villaId: string) {
    setError(null);
    setPendingVilla(villaId);
    try {
      const r = await rotateVillaIcalTokenAction({ villaId });
      if (r.ok) {
        setRevealed({ villaId, feedUrl: r.feedUrl });
        setCopied(false);
      } else {
        setError(r.error);
      }
    } finally {
      setPendingVilla(null);
    }
  }

  async function onRevoke(villaId: string) {
    setError(null);
    setPendingVilla(villaId);
    try {
      const r = await revokeVillaIcalTokenAction({ villaId });
      if (!r.ok) setError(r.error);
      if (revealed?.villaId === villaId) setRevealed(null);
    } finally {
      setPendingVilla(null);
    }
  }

  async function onCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the URL is selectable in the input below.
    }
  }

  return (
    <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
      <div className="p-4 border-b border-line-soft">
        <div className="text-sm text-ink font-medium">Export to OTAs (outbound iCal)</div>
        <p className="text-[11px] text-ink-tertiary mt-0.5 max-w-[640px]">
          Each villa gets a secret feed URL serving its blocked dates
          (reservations + manual blocks — no guest details). Paste it into
          Airbnb / Booking.com / Vrbo &quot;Import calendar&quot; so a booking here
          blocks the villa there. The URL is shown once — rotating it
          invalidates the old one.
        </p>
      </div>
      {error && (
        <p className="px-4 pt-3 text-[11px] text-danger">{error}</p>
      )}
      <ul className="divide-y divide-line-soft">
        {rows.map((r) => (
          <li key={r.villaId} className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-sm text-ink font-medium">{r.villaLabel}</span>
                <div className="text-[11px] text-ink-tertiary mt-0.5">
                  {r.tokenPrefix ? (
                    <>
                      feed active · token {r.tokenPrefix}… ·{" "}
                      {r.accessCount > 0
                        ? `${r.accessCount} fetch${r.accessCount === 1 ? "" : "es"}${
                            r.lastAccessedAt
                              ? `, last ${new Date(r.lastAccessedAt).toLocaleString()}`
                              : ""
                          }`
                        : "never fetched yet"}
                    </>
                  ) : (
                    "no export feed"
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pendingVilla === r.villaId}
                  onClick={() => onRotate(r.villaId)}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" strokeWidth={1.75} />
                  {r.tokenPrefix ? "Rotate URL" : "Generate URL"}
                </Button>
                {r.tokenPrefix && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pendingVilla === r.villaId}
                    onClick={() => onRevoke(r.villaId)}
                  >
                    <Ban className="w-3.5 h-3.5 mr-1" strokeWidth={1.75} />
                    Revoke
                  </Button>
                )}
              </div>
            </div>
            {revealed?.villaId === r.villaId && (
              <div className="rounded-md border border-line-soft bg-muted/20 p-3 flex flex-col gap-2">
                <p className="text-[11px] text-warning">
                  Copy this URL now — it is shown only once. Rotating later
                  produces a new URL and invalidates this one.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={revealed.feedUrl}
                    className="flex-1 min-w-0 text-[12px] font-mono bg-surface border border-line-soft rounded px-2 py-1.5"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button size="sm" variant="secondary" onClick={() => onCopy(revealed.feedUrl)}>
                    {copied ? (
                      <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
                    ) : (
                      <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="p-4 text-[12px] text-ink-tertiary">
            No villas yet — add a villa first, then generate its export feed.
          </li>
        )}
      </ul>
    </div>
  );
}
