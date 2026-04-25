import { Badge } from "@/components/ui/badge";

interface LogEntry {
  at: string;
  who: string;
  assistant: string;
  action: string;
  details: string;
  outcome: "read" | "suggested" | "confirmed" | "blocked";
}

const entries: LogEntry[] = [
  {
    at: "14:02",
    who: "Dewi S. · Finance Manager",
    assistant: "Finance Analyst",
    action: "Queried variance",
    details: "Top 10 expense categories · Eternal YTD",
    outcome: "read",
  },
  {
    at: "13:38",
    who: "Made P. · Operations Manager",
    assistant: "Operations Copilot",
    action: "Proposed task reassign",
    details: "Housekeeping · ES-S2 → Sari W. (pending confirm)",
    outcome: "suggested",
  },
  {
    at: "13:11",
    who: "Emma W. · Investor",
    assistant: "Investor Assistant",
    action: "Asked about March variance",
    details: "EV-07 · -18.0% MoM payout explanation",
    outcome: "read",
  },
  {
    at: "12:56",
    who: "Emma W. · Investor",
    assistant: "Investor Assistant",
    action: "Attempted cross-owner query",
    details: "Other owners' shares · refused, cited scope rule",
    outcome: "blocked",
  },
  {
    at: "11:42",
    who: "Agung R. · Procurement",
    assistant: "Procurement Assistant",
    action: "Suggested supplier",
    details: "Bamboo linen · ranked 3 suppliers by lead time",
    outcome: "suggested",
  },
  {
    at: "10:29",
    who: "Nikita R. · Director",
    assistant: "Report Writer",
    action: "Drafted Q1 letter",
    details: "Enso pool members · 612 words (draft)",
    outcome: "read",
  },
];

const outcomeBadge: Record<LogEntry["outcome"], { tone: "neutral" | "accent" | "warning" | "danger"; label: string }> = {
  read: { tone: "neutral", label: "Read-only" },
  suggested: { tone: "accent", label: "Suggested" },
  confirmed: { tone: "warning", label: "Confirmed" },
  blocked: { tone: "danger", label: "Blocked by scope" },
};

export function AIAuditLog() {
  return (
    <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
      <div className="p-5 border-b border-line-soft flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <span className="text-label">AI audit log · today</span>
          <h3 className="text-base font-medium text-ink mt-1.5">
            Every prompt, retrieval, and tool call is recorded.
          </h3>
        </div>
        <span className="text-xs text-ink-tertiary">
          Demo entries · retention 1 year (90 days for high-sensitivity)
        </span>
      </div>
      <div className="divide-y divide-line-soft">
        {entries.map((e, i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_1fr_auto] gap-4 md:gap-6 items-start px-5 py-3.5 hover:bg-muted/40 transition-colors"
          >
            <span className="font-mono tabular-nums text-[11px] text-ink-tertiary pt-0.5">
              {e.at}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm text-ink">{e.who}</span>
                <span className="text-ink-tertiary text-xs">
                  · {e.assistant}
                </span>
              </div>
              <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
                <span className="text-ink-tertiary">{e.action}</span> —{" "}
                {e.details}
              </p>
            </div>
            <Badge tone={outcomeBadge[e.outcome].tone}>
              {outcomeBadge[e.outcome].label}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
