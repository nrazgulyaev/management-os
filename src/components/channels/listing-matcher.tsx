"use client";

/**
 * Phase 2.4 mgmt-01 — ListingMatcher.
 *
 * Step 3 of ConnectWizard. Renders the channel-listing-matcher
 * agent's results in 3 zones:
 *   - matched (high confidence) — pre-linked, can be unlinked
 *   - ambiguous (medium confidence) — multiple candidates shown
 *   - unmatched (no confident match) — manual pick
 *
 * The agent stub lives at src/features/ai-agents/channel-listing-matcher/.
 */

import * as React from "react";

export interface ListingMatchCandidate {
  villaId: string;
  villaName: string;
  /** 0..1 */
  confidence: number;
}

export interface ListingMatch {
  extId: string;
  extName: string;
  /** Server-side preferred candidate, or null when unmatched. */
  suggestedVillaId: string | null;
  candidates: ListingMatchCandidate[];
  /** "matched" | "ambiguous" | "unmatched" — convenience bucket. */
  bucket: "matched" | "ambiguous" | "unmatched";
}

export interface ListingMatcherProps {
  matches: ListingMatch[];
  mapping: Record<string, string | null>;
  onMappingChange: (next: Record<string, string | null>) => void;
}

export function ListingMatcher({ matches, mapping, onMappingChange }: ListingMatcherProps) {
  if (matches.length === 0) {
    return <div className="lm-empty mono">No listings returned. Check the channel auth.</div>;
  }
  const buckets = {
    matched: matches.filter((m) => m.bucket === "matched"),
    ambiguous: matches.filter((m) => m.bucket === "ambiguous"),
    unmatched: matches.filter((m) => m.bucket === "unmatched"),
  };

  function setVilla(extId: string, villaId: string | null) {
    onMappingChange({ ...mapping, [extId]: villaId });
  }

  return (
    <div className="listing-matcher">
      {(["matched", "ambiguous", "unmatched"] as const).map((b) => {
        const rows = buckets[b];
        if (!rows.length) return null;
        return (
          <section key={b} className={`lm-bucket lm-${b}`}>
            <header className="lm-bucket-head">
              <span className="lm-bucket-label mono">{b}</span>
              <span className="lm-bucket-count mono">{rows.length}</span>
            </header>
            <div className="lm-rows">
              {rows.map((m) => (
                <div key={m.extId} className="lm-row">
                  <div className="lm-listing">
                    <div className="lm-listing-name">{m.extName}</div>
                    <div className="lm-listing-id mono">{m.extId}</div>
                  </div>
                  <div className="lm-pick">
                    <select
                      className="select"
                      value={mapping[m.extId] ?? ""}
                      onChange={(e) => setVilla(m.extId, e.target.value || null)}
                    >
                      <option value="">{b === "unmatched" ? "— pick a villa —" : "— skip —"}</option>
                      {m.candidates.map((c) => (
                        <option key={c.villaId} value={c.villaId}>
                          {c.villaName} ({Math.round(c.confidence * 100)}%)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
