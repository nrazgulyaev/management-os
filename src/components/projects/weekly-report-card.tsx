import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown-renderer";

/**
 * Server-rendered card for the weekly-report-composer output.
 *
 * Presentational only — the page composes the report (DB reads + optional
 * AI polish) and passes the finished assembly in. Renders the highlight
 * chips, an AI/deterministic provenance badge, and the markdown body.
 */

export interface WeeklyReportCardProps {
  weekStart: string;
  weekEnding: string;
  markdown: string;
  highlights: { label: string; value: string }[];
  aiPolished: boolean;
  aiNote: string | null;
  isQuiet: boolean;
}

export function WeeklyReportCard({
  weekStart,
  weekEnding,
  markdown,
  highlights,
  aiPolished,
  aiNote,
  isQuiet,
}: WeeklyReportCardProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
          {weekStart} → {weekEnding}
        </span>
        <Badge tone={aiPolished ? "gold" : "outline"}>
          {aiPolished ? "AI-polished" : "Deterministic draft"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {highlights.map((h) => (
          <div
            key={h.label}
            className="rounded-md border border-line-soft bg-surface px-4 py-3 flex flex-col gap-0.5"
          >
            <span className="text-label">{h.label}</span>
            <span className="text-sm text-ink font-mono tabular-nums">
              {h.value}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-line-soft bg-surface px-5 py-4">
        {isQuiet ? (
          <p className="text-sm text-ink-secondary leading-relaxed">
            No milestone, cost, RFI, or site-report movement was recorded this
            week.
          </p>
        ) : (
          <MarkdownRenderer body={markdown} />
        )}
      </div>

      {aiNote && (
        <p className="text-[11px] text-ink-tertiary">{aiNote}</p>
      )}
    </div>
  );
}
