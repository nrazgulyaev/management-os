"use client";

/**
 * Phase 2.4 seed — StoryboardLog.
 *
 * Pure-presentational site-supervisor daily log. Each day is a
 * .sb-day band with a sticky meta column (date + author + weather)
 * and N storyboard frames (photo + caption + narration + side
 * facts). Photo click → lightbox (Radix Dialog).
 *
 * See src/styles/components/p24-primitives.css for .sb-* classes.
 */

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";

export interface StoryboardFrameSideRow {
  key: string;
  value: string;
  severity?: "p1" | "warn";
}

export interface StoryboardFrame {
  id: string;
  photoUrl?: string;
  /** Aspect ratio drives CSS class (.sb-photo / .sb-photo.tall / .sb-photo.wide). */
  aspect: "16:9" | "4:5" | "21:9";
  pill: { text: string; kind: "neutral" | "alert" | "flag" };
  stamp: string;
  caption: string;
  narration: string;
  side: StoryboardFrameSideRow[];
}

export interface StoryboardDay {
  date: Date;
  weather: { temp: string; condition: string; stopHours?: number };
  author: { id: string; name: string; role: string; avatar?: string };
  frames: StoryboardFrame[];
}

export interface StoryboardLogProps {
  days: StoryboardDay[];
  className?: string;
}

const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function StoryboardLog({ days, className }: StoryboardLogProps) {
  const [zoom, setZoom] = React.useState<{ url: string; caption: string } | null>(null);

  return (
    <div className={`storyboard-log${className ? ` ${className}` : ""}`}>
      {days.map((d, i) => {
        const day = d.date.getUTCDate();
        const month = d.date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
        return (
          <section className="sb-day" key={i}>
            <aside className="meta">
              <div className="date">
                {day} {month}
              </div>
              <div className="dow">{DOW_FULL[d.date.getUTCDay()]}</div>
              <div className="who">
                <div>
                  <div>{d.author.name}</div>
                  <span className="role">{d.author.role}</span>
                </div>
              </div>
              <div className="weather">
                <strong>{d.weather.temp}</strong> · {d.weather.condition}
                {d.weather.stopHours != null && <> · Stop {d.weather.stopHours}h</>}
              </div>
            </aside>
            <div className="sb-frames">
              {d.frames.map((f) => {
                const aspectClass = f.aspect === "4:5" ? "tall" : f.aspect === "21:9" ? "wide" : "";
                return (
                  <article className="sb-frame" key={f.id}>
                    <button
                      type="button"
                      className={`sb-photo ${aspectClass}`}
                      style={f.photoUrl ? { backgroundImage: `url(${f.photoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                      onClick={() => f.photoUrl && setZoom({ url: f.photoUrl, caption: f.caption })}
                      aria-label={f.caption}
                    >
                      <span className={`pill${f.pill.kind === "alert" ? " alert" : ""}${f.pill.kind === "flag" ? " flag" : ""}`}>{f.pill.text}</span>
                      <span className="stamp">{f.stamp}</span>
                      {!f.photoUrl && <span>No photo</span>}
                    </button>
                    <div className="body">
                      <div>
                        <h3 className="caption">{f.caption}</h3>
                        <p className="narration">{f.narration}</p>
                      </div>
                      <div className="side">
                        {f.side.map((row, k) => (
                          <div className="row" key={k}>
                            <span className="k">{row.key}</span>
                            <span className={`v${row.severity ? ` ${row.severity}` : ""}`}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      <Dialog.Root open={zoom !== null} onOpenChange={(o) => !o && setZoom(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="photo-lightbox-overlay" />
          <Dialog.Content className="photo-lightbox" aria-label="Photo zoom">
            {zoom && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={zoom.url} alt={zoom.caption} />
                <button type="button" className="photo-lightbox-close" onClick={() => setZoom(null)} aria-label="Close">
                  ×
                </button>
                <div className="photo-lightbox-caption">{zoom.caption}</div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
