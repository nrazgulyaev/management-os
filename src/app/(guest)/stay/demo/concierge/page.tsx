"use client";

import Link from "next/link";
import { useState } from "react";
import { StayShell } from "@/components/layout/stay-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send } from "lucide-react";
import {
  DEMO_CONCIERGE_PROMPTS,
  DEMO_CONCIERGE_REPLIES,
  DEMO_STAY,
} from "@/features/demo-data/stay-demo-content";

interface DemoMessage {
  who: "guest" | "concierge";
  text: string;
}

function pickReply(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("dinner") || lower.includes("restaurant"))
    return DEMO_CONCIERGE_REPLIES.dinner;
  if (lower.includes("breakfast") || lower.includes("chef"))
    return DEMO_CONCIERGE_REPLIES.breakfast;
  if (lower.includes("checkout") || lower.includes("check-out"))
    return DEMO_CONCIERGE_REPLIES.checkout;
  if (lower.includes("airport") || lower.includes("driver"))
    return DEMO_CONCIERGE_REPLIES.airport;
  if (lower.includes("doctor") || lower.includes("hospital"))
    return DEMO_CONCIERGE_REPLIES.doctor;
  return DEMO_CONCIERGE_REPLIES.default;
}

export default function StayDemoConciergePage() {
  const [messages, setMessages] = useState<DemoMessage[]>([
    {
      who: "concierge",
      text: "Hi — this is the demo concierge. Try one of the suggested prompts or type your own.",
    },
  ]);
  const [draft, setDraft] = useState("");

  function send(text: string) {
    if (!text.trim()) return;
    setMessages((prev) => [
      ...prev,
      { who: "guest", text: text.trim() },
      { who: "concierge", text: pickReply(text) },
    ]);
    setDraft("");
  }

  return (
    <StayShell
      villaName={DEMO_STAY.villaName}
      dates="25 Apr → 29 Apr · 4 nights"
      basePath="/stay/demo"
    >
      <div className="flex flex-col gap-8">
        <Link
          href="/stay/demo"
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to your stay
        </Link>

        <header className="flex flex-col gap-2">
          <Badge tone="gold">Demo only · canned replies</Badge>
          <h1 className="text-display text-[28px] md:text-[36px] font-medium text-ink">
            Concierge
          </h1>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
            This is a static demo with five canned replies. In production the
            concierge is powered by Claude with retrieval over your stay
            context, the villa guide, and the services catalog.
          </p>
        </header>

        <section className="rounded-lg border border-line-soft bg-surface flex flex-col">
          <div className="flex flex-col gap-3 p-5 max-h-[420px] overflow-y-auto">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                  m.who === "guest"
                    ? "self-end bg-ink text-ink-inverse"
                    : "self-start bg-muted/40 border border-line-soft text-ink"
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>

          <div className="border-t border-line-soft p-3 flex flex-wrap gap-2">
            {DEMO_CONCIERGE_PROMPTS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => send(p)}
                className="text-xs px-3 py-1.5 rounded-full border border-line-soft text-ink-secondary hover:border-line-strong hover:text-ink"
              >
                {p}
              </button>
            ))}
          </div>

          <form
            className="border-t border-line-soft p-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              className="flex-1 h-10 rounded-md border border-line-soft bg-canvas px-3 text-sm text-ink"
            />
            <Button type="submit" size="sm" disabled={draft.trim().length === 0}>
              <Send className="w-3.5 h-3.5" />
              Send
            </Button>
          </form>
        </section>
      </div>
    </StayShell>
  );
}
