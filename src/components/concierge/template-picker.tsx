"use client";

/**
 * Phase 2.4 mgmt-04 — TemplatePicker.
 *
 * Side dropdown over the composer. Categories: welcome / FAQ /
 * comp-offer / closing. Inserts the chosen template body into the
 * composer with mustache-style placeholders resolved against the
 * current stay context.
 */

import * as React from "react";

export interface ConciergeTemplate {
  id: string;
  category: "welcome" | "faq" | "comp" | "closing";
  title: string;
  body: string;
}

export interface TemplatePickerProps {
  templates: ConciergeTemplate[];
  context: Record<string, string>;
  onInsert?: (resolvedBody: string) => void;
  className?: string;
}

function resolveTemplate(body: string, context: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => context[key] ?? `{{${key}}}`);
}

export function TemplatePicker({ templates, context, onInsert, className }: TemplatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<ConciergeTemplate["category"] | "all">("all");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = templates.filter((t) => category === "all" || t.category === category);

  return (
    <div className={`template-picker${className ? ` ${className}` : ""}`} ref={ref}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
        Templates
      </button>
      {open && (
        <div className="tp-pop">
          <header className="tp-cats">
            {(["all", "welcome", "faq", "comp", "closing"] as const).map((c) => (
              <button
                key={c}
                type="button"
                className={`tp-cat${category === c ? " is-on" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </header>
          <div className="tp-list">
            {filtered.length === 0 && <div className="tp-empty mono">No templates.</div>}
            {filtered.map((t) => (
              <button
                type="button"
                key={t.id}
                className="tp-row"
                onClick={() => {
                  onInsert?.(resolveTemplate(t.body, context));
                  setOpen(false);
                }}
              >
                <span className="tp-title">{t.title}</span>
                <span className="tp-cat-tag mono">{t.category}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
