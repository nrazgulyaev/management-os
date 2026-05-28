"use client";

/**
 * Phase 2.4 mgmt-01 — ConnectWizard.
 *
 * 3-step OTA connect flow:
 *   1. Pick channel (Airbnb / Booking.com / Avito)
 *   2. OAuth / API-key entry
 *   3. Listing-matcher review (auto-matched, ambiguous, unmatched)
 *
 * Each step is a section; navigation is local state. On final
 * confirm, the caller's onFinish handles the persistence.
 */

import * as React from "react";
import { ListingMatcher, type ListingMatch } from "./listing-matcher";

export type ChannelCode = "airbnb" | "booking-com" | "avito";

export interface ConnectWizardProps {
  /** Existing channel codes already connected — filter from step 1. */
  existing?: ChannelCode[];
  /** Server fn that does OAuth handshake or stores the API key. */
  onAuth?: (channelCode: ChannelCode, payload: Record<string, string>) => Promise<{ ok: boolean }>;
  /** Server fn that calls the channel-listing-matcher agent. */
  onFetchMatches?: (channelCode: ChannelCode) => Promise<ListingMatch[]>;
  /** Server fn called at the end with the final mapping. */
  onFinish?: (channelCode: ChannelCode, mapping: Record<string, string | null>) => Promise<void> | void;
  onCancel?: () => void;
}

const CHANNELS: { code: ChannelCode; label: string; auth: "oauth" | "api-key" }[] = [
  { code: "airbnb", label: "Airbnb", auth: "oauth" },
  { code: "booking-com", label: "Booking.com", auth: "api-key" },
  { code: "avito", label: "Avito", auth: "api-key" },
];

export function ConnectWizard({ existing = [], onAuth, onFetchMatches, onFinish, onCancel }: ConnectWizardProps) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [channel, setChannel] = React.useState<ChannelCode | null>(null);
  const [authPayload, setAuthPayload] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [matches, setMatches] = React.useState<ListingMatch[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string | null>>({});

  const channelMeta = channel ? CHANNELS.find((c) => c.code === channel) : null;

  async function advanceFromAuth() {
    if (!channel) return;
    setBusy(true);
    try {
      const res = await onAuth?.(channel, authPayload);
      if (!res || res.ok) {
        const list = (await onFetchMatches?.(channel)) ?? [];
        setMatches(list);
        // Default mapping: auto-matched listings link to their suggested villa.
        const initial: Record<string, string | null> = {};
        for (const m of list) initial[m.extId] = m.suggestedVillaId ?? null;
        setMapping(initial);
        setStep(3);
      }
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!channel) return;
    setBusy(true);
    try {
      await onFinish?.(channel, mapping);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="connect-wizard">
      <ol className="cw-steps mono">
        <li className={step >= 1 ? "is-on" : ""}>1 · Channel</li>
        <li className={step >= 2 ? "is-on" : ""}>2 · Authenticate</li>
        <li className={step >= 3 ? "is-on" : ""}>3 · Match listings</li>
      </ol>

      {step === 1 && (
        <section className="cw-step">
          <h3 className="cw-step-title">Pick a channel</h3>
          <div className="cw-channels">
            {CHANNELS.map((c) => {
              const disabled = existing.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  className={`cw-channel-btn${channel === c.code ? " is-on" : ""}${disabled ? " is-disabled" : ""}`}
                  onClick={() => !disabled && setChannel(c.code)}
                  disabled={disabled}
                >
                  <span className="cw-channel-name">{c.label}</span>
                  <span className="cw-channel-auth mono">{c.auth}</span>
                  {disabled && <span className="cw-channel-tag mono">connected</span>}
                </button>
              );
            })}
          </div>
          <footer className="cw-foot">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!channel}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </footer>
        </section>
      )}

      {step === 2 && channelMeta && (
        <section className="cw-step">
          <h3 className="cw-step-title">Authenticate {channelMeta.label}</h3>
          {channelMeta.auth === "oauth" ? (
            <p className="cw-help">We&apos;ll redirect you to {channelMeta.label} to grant access. After approval you&apos;ll come back here.</p>
          ) : (
            <div className="field">
              <label className="field-label">API key</label>
              <input
                className="input"
                value={authPayload.apiKey ?? ""}
                onChange={(e) => setAuthPayload({ apiKey: e.target.value })}
                placeholder="paste from channel admin"
              />
            </div>
          )}
          <footer className="cw-foot">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>Back</button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || (channelMeta.auth === "api-key" && !authPayload.apiKey)}
              onClick={advanceFromAuth}
            >
              {busy ? "Authenticating…" : "Authenticate & fetch listings"}
            </button>
          </footer>
        </section>
      )}

      {step === 3 && (
        <section className="cw-step">
          <h3 className="cw-step-title">Match listings to villas</h3>
          <ListingMatcher matches={matches} mapping={mapping} onMappingChange={setMapping} />
          <footer className="cw-foot">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>Back</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={finish}>
              {busy ? "Saving…" : "Finish setup"}
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}
