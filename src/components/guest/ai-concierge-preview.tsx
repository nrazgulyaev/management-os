"use client";

import * as React from "react";
import { Sparkles, Send, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const suggestions = [
  "How do I use the air conditioning?",
  "Book a chef for Saturday at 7pm",
  "Recommend a restaurant nearby",
  "Is there late check-out available?",
];

export function AIConciergePreview() {
  const [value, setValue] = React.useState("");
  return (
    <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
      <header className="p-5 border-b border-line-soft flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-accent-weak text-accent inline-flex items-center justify-center">
            <Sparkles className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">
                Arconique Concierge
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success" /> Online
              </span>
            </div>
            <p className="text-xs text-ink-tertiary mt-0.5">
              Replies in under two minutes · WhatsApp handoff available
            </p>
          </div>
        </div>
        <Button size="sm" variant="secondary">
          <Phone className="w-4 h-4" strokeWidth={1.75} />
          WhatsApp instead
        </Button>
      </header>

      <div className="p-5 flex flex-col gap-3 min-h-[220px]">
        <div className="self-start max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm text-ink leading-relaxed">
          Welcome to Enso Villa S5, Mr. Martin. Anything we should prepare for
          Saturday — breakfast set-up, a driver from the airport, or a private
          chef for the first evening?
        </div>
        <div className="self-end max-w-[80%] rounded-2xl rounded-br-sm bg-accent text-accent-contrast px-4 py-3 text-sm leading-relaxed">
          How do I use the air conditioning in the master bedroom?
        </div>
        <div className="self-start max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm text-ink leading-relaxed">
          The master bedroom uses a dual-zone control. Press MODE twice to
          switch to COOL, then set the temperature with the arrows. The moon
          icon is quiet-night mode.
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="accent">Source · Villa guide · AC</Badge>
          </div>
        </div>
      </div>

      <div className="px-5 pt-1 pb-3 border-t border-line-soft">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setValue(s)}
              className="text-left rounded-full px-3 py-1.5 text-[11px] border border-line-soft bg-muted text-ink-secondary hover:text-ink hover:border-line-strong transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-sm border border-line-soft bg-canvas px-3 py-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-tertiary focus:outline-none"
          />
          <Button size="sm" type="button">
            <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
            Send
          </Button>
        </div>
        <p className="text-[11px] text-ink-tertiary mt-2 leading-relaxed">
          Preview only — the Guest Concierge never shares your smart-lock code
          in chat, never references neighbouring villas, and hands off to a
          human immediately on any safety or medical matter.
        </p>
      </div>
    </div>
  );
}
