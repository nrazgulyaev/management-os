"use client";

import * as React from "react";
import { Sparkles, ArrowRight, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Prompt = {
  id: string;
  question: string;
  answer: React.ReactNode;
  citations: string[];
};

const prompts: Prompt[] = [
  {
    id: "delta",
    question: "Why did my payout drop 18% on Eternal 07 this month?",
    answer: (
      <>
        Net payout fell from <strong>Rp 95.2M in February</strong> to{" "}
        <strong>Rp 78.0M in March</strong> — a{" "}
        <strong>Rp 17.2M (-18.0%)</strong> variance driven by three
        line items:
        <ol className="list-decimal pl-5 mt-3 flex flex-col gap-2">
          <li>
            <strong>Airbnb mix ↑</strong> — share of bookings via Airbnb rose
            from 22% to 41% this month, shifting OTA commissions up by Rp 8.4M.
          </li>
          <li>
            <strong>Quarterly AC deep clean</strong> — Rp 4.8M of scheduled
            preventive maintenance posted against the villa (not the pool),
            per the Eternal Villas allocation rule.
          </li>
          <li>
            <strong>FF&E reserve top-up</strong> — the board-approved FF&E
            ratio moved from 4% to 5% from March onwards, adding Rp 4.0M to
            the reserve liability (shown on your reserve balance).
          </li>
        </ol>
        <p className="mt-3 text-ink-tertiary text-xs">
          No other line materially changed. Occupancy and ADR held within
          ±1% vs. February.
        </p>
      </>
    ),
    citations: [
      "Statement STM-EV07-2026-03",
      "Revenue lines · channel = Airbnb",
      "Expense ES-EV07-2026-03-0118 (AC service)",
      "Allocation rule v4.2 · effective 2026-03-01",
    ],
  },
  {
    id: "reserve",
    question: "What is my Renovation reserve balance and when does it get used?",
    answer: (
      <>
        Your Eternal 07 <strong>Renovation reserve</strong> holds{" "}
        <strong>Rp 62.4M</strong> as of 31 March 2026. Contributions are 3%
        of net revenue per month. Use requires an owner approval above the
        Rp 25M threshold; smaller preventive spend draws from the FF&E
        reserve (balance: Rp 41.2M).
      </>
    ),
    citations: [
      "Reserves ledger · villa = EV-07",
      "Contract §7.2 · Reserve policy",
    ],
  },
  {
    id: "compare",
    question: "How did my two villas compare YTD?",
    answer: (
      <>
        <strong>Enso S5</strong> delivered <strong>Rp 399.6M</strong> in net
        payouts YTD at <strong>89.1% occupancy</strong> — ahead of{" "}
        <strong>Eternal 07</strong>'s <strong>Rp 284.6M</strong> at 82.0%.
        ADR differs (ES-S5 Rp 10.8M · EV-07 Rp 7.8M) reflecting Berawa vs.
        Ubud pricing. Your reserve balances are Rp 62.4M each.
      </>
    ),
    citations: [
      "Villa finance · ES-S5 YTD",
      "Villa finance · EV-07 YTD",
    ],
  },
];

export function AIPayoutExplainer() {
  const [active, setActive] = React.useState(prompts[0].id);
  const current = prompts.find((p) => p.id === active) ?? prompts[0];

  return (
    <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
      <header className="p-5 md:p-6 border-b border-line-soft flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-md bg-ink text-ink-inverse inline-flex items-center justify-center">
          <Sparkles className="w-4 h-4" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink">
              Investor Assistant
            </span>
            <Badge tone="gold">Preview</Badge>
          </div>
          <p className="text-xs text-ink-tertiary mt-1 leading-relaxed">
            Answers are grounded in your statement and ledger rows. The
            assistant will not invent a number — if the data is not in your
            scope, it says so.
          </p>
        </div>
      </header>

      <div className="p-5 md:p-6 border-b border-line-soft">
        <span className="text-label mb-3 inline-block">Try a question</span>
        <div className="flex flex-wrap gap-2">
          {prompts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(p.id)}
              className={`text-left rounded-full px-3 py-1.5 text-xs border transition-colors ${
                active === p.id
                  ? "bg-ink text-ink-inverse border-ink"
                  : "bg-muted text-ink-secondary border-line-soft hover:text-ink"
              }`}
            >
              {p.question}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 md:p-6 flex flex-col gap-4">
        <div className="rounded-md bg-muted/40 border border-line-soft p-4">
          <div className="text-label mb-2">You</div>
          <p className="text-sm text-ink">{current.question}</p>
        </div>
        <div className="rounded-md bg-surface border border-line-soft p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-label">Investor Assistant</span>
            <span className="text-[10px] text-ink-tertiary">
              1.2s · 4 sources
            </span>
          </div>
          <div className="text-sm text-ink leading-relaxed space-y-0">
            {current.answer}
          </div>
          <div className="mt-4 pt-4 border-t border-line-soft flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-widest text-ink-tertiary mr-1">
                Cited
              </span>
              {current.citations.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 text-[11px] rounded-sm bg-accent-weak text-accent px-2 py-0.5"
                >
                  <ArrowRight className="w-3 h-3" strokeWidth={2} />
                  {c}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                aria-label="Helpful"
                className="h-7 w-7 rounded-full border border-line-soft bg-surface hover:bg-muted inline-flex items-center justify-center text-ink-tertiary hover:text-ink transition-colors"
              >
                <ThumbsUp className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
              <Button size="sm" variant="secondary">
                Open in statement
              </Button>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-ink-tertiary">
          Preview only — the Investor Assistant is not yet connected to a
          provider. Wiring arrives with Version 3 (Finance & Investor
          Reporting) per the implementation roadmap.
        </p>
      </div>
    </div>
  );
}
