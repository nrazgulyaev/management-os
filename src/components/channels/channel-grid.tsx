"use client";

/**
 * Phase 2.4 seed — ChannelGrid.
 *
 * Controlled rate-calendar grid. Renders an Mgmt-cabinet channels
 * view as a 14-day (default) matrix of villas × channels × dates.
 * Each cell shows the rate + sync indicator and supports inline
 * edit. Multi-day stays are rendered as absolute overlays.
 *
 * CSS classes drive everything; this component just emits markup.
 * See src/styles/components/p24-primitives.css for .channel-grid
 * and .cg-* classes.
 */

import * as React from "react";

export type RateCellSync = "synced" | "stale" | "conflict";

export interface RateCell {
  amount: number;
  /** Block reasons override amount (booked, blocked, etc). */
  state?: "open" | "blocked" | "booked";
  sync?: RateCellSync;
  /** Comparison vs algo / base rate for color tint. */
  comparison?: "below" | "above";
}

export interface ChannelGridVilla {
  id: string;
  name: string;
}

export interface ChannelGridChannel {
  id: string;
  name: string;
  /** CSS color for the channel dot. */
  color: string;
  type: "direct" | "ota";
  feePct?: number;
}

export interface Stay {
  id: string;
  villaId: string;
  channelId: string;
  /** ISO YYYY-MM-DD inclusive */
  startDate: string;
  /** ISO YYYY-MM-DD inclusive */
  endDate: string;
  label?: string;
  /** Maps to a .cg-stay variant class (direct / airbnb / booking-com / avito / tentative). */
  tone: "direct" | "airbnb" | "booking-com" | "avito" | "tentative";
}

export interface ChannelGridProps {
  villas: ChannelGridVilla[];
  channels: ChannelGridChannel[];
  dates: Date[];
  cells: Record<string, RateCell>;
  stays?: Stay[];
  onCellEdit?: (key: string, amount: number) => void;
  onRangeSelect?: (keys: string[]) => void;
  selectedKeys?: string[];
  mobileMode?: "auto" | "single-villa";
  className?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function cellKey(villaId: string, channelId: string, d: Date): string {
  return `${villaId}:${channelId}:${isoDate(d)}`;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ChannelGrid({
  villas,
  channels,
  dates,
  cells,
  stays = [],
  onCellEdit,
  selectedKeys,
  className,
}: ChannelGridProps) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<string>("");
  const today = isoDate(new Date());
  const styleVar = { "--cols": dates.length } as React.CSSProperties;
  const colWidth = 56; // matches --col-w in CSS

  function commit() {
    if (!editing) return;
    const num = Number(draft);
    if (Number.isFinite(num) && num > 0) onCellEdit?.(editing, num);
    setEditing(null);
    setDraft("");
  }

  return (
    <div className={`channel-grid${className ? ` ${className}` : ""}`} style={styleVar}>
      <div className="cg-head">
        <div className="corner">Villa · Channel</div>
        {dates.map((d) => {
          const iso = isoDate(d);
          const cls = `day${isWeekend(d) ? " weekend" : ""}${iso === today ? " today" : ""}`;
          return (
            <div key={iso} className={cls}>
              <span className="dow">{DOW[d.getUTCDay()]}</span>
              <span className="dn">{d.getUTCDate()}</span>
            </div>
          );
        })}
      </div>

      {villas.map((v) => (
        <React.Fragment key={v.id}>
          <div className="cg-row villa-group">
            <div className="label">{v.name}</div>
            {dates.map((d) => (
              <div key={isoDate(d)} className="cg-cell" aria-hidden />
            ))}
          </div>
          {channels.map((c) => (
            <div className="cg-row" key={`${v.id}:${c.id}`} style={{ position: "relative" }}>
              <div className="label">
                <span className="ch" style={{ background: c.color }} aria-hidden />
                <span>{c.name}</span>
                {c.feePct != null && <span className="meta">−{c.feePct}%</span>}
              </div>
              {dates.map((d) => {
                const key = cellKey(v.id, c.id, d);
                const cell = cells[key];
                const weekend = isWeekend(d);
                const isEditing = editing === key;
                const isSelected = selectedKeys?.includes(key);
                const state = cell?.state;
                const sync = cell?.sync;
                const compClass = cell?.comparison ? ` ${cell.comparison}` : "";
                const cls = [
                  "cg-cell",
                  weekend ? "weekend" : "",
                  state === "blocked" ? "blocked" : "",
                  state === "booked" ? "booked" : "",
                  sync ? sync : "",
                  isEditing ? "editing" : "",
                  isSelected ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div
                    key={key}
                    className={cls}
                    onClick={() => {
                      if (state === "blocked" || state === "booked") return;
                      setEditing(key);
                      setDraft(cell ? String(cell.amount) : "");
                    }}
                  >
                    {!isEditing && state !== "blocked" && state !== "booked" && cell && (
                      <span className={`rate${compClass}`}>{cell.amount}</span>
                    )}
                    {sync && <span className="indicator" aria-hidden />}
                    {isEditing && (
                      <div className="cg-edit-pop">
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commit();
                            else if (e.key === "Escape") {
                              setEditing(null);
                              setDraft("");
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              {stays
                .filter((s) => s.villaId === v.id && s.channelId === c.id)
                .map((s) => {
                  const startIdx = dates.findIndex((d) => isoDate(d) === s.startDate);
                  const endIdx = dates.findIndex((d) => isoDate(d) === s.endDate);
                  if (startIdx < 0 && endIdx < 0) return null;
                  const a = Math.max(0, startIdx);
                  const b = endIdx < 0 ? dates.length - 1 : endIdx;
                  const span = b - a + 1;
                  return (
                    <div
                      key={s.id}
                      className={`cg-stay ${s.tone}`}
                      style={{
                        left: `calc(var(--row-label-w, 200px) + ${a * colWidth}px + 6px)`,
                        width: `calc(${span * colWidth}px - 12px)`,
                      }}
                    >
                      {s.label ?? `${s.startDate}–${s.endDate}`}
                    </div>
                  );
                })}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}
