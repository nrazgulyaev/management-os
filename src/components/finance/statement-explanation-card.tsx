import { Section } from "@/components/ui/section";
import type { StatementExplanationSnapshot } from "@/lib/db/schema/statement-transparency";

export function StatementExplanationCard({
  snapshot,
  fallbackHeadline,
  fallbackBullets,
}: {
  snapshot: StatementExplanationSnapshot | null;
  fallbackHeadline: string;
  fallbackBullets: string[];
}) {
  const headline = snapshot?.headline ?? fallbackHeadline;
  const bullets =
    snapshot?.bulletPoints && Array.isArray(snapshot.bulletPoints)
      ? (snapshot.bulletPoints as string[])
      : fallbackBullets;
  return (
    <Section eyebrow="Why this number" title={headline}>
      <div className="rounded-md border border-line-soft bg-muted/30 p-5 flex flex-col gap-3">
        {snapshot?.summary && (
          <p className="text-sm text-ink leading-relaxed">{snapshot.summary}</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {bullets.map((b, i) => (
            <li
              key={i}
              className="text-sm text-ink-secondary leading-relaxed flex items-start gap-2"
            >
              <span className="w-1 h-1 rounded-full bg-ink-tertiary mt-2 shrink-0" />
              {b}
            </li>
          ))}
        </ul>
        {snapshot?.payoutExplanation && (
          <p className="text-xs text-ink-tertiary border-t border-line-soft pt-2 leading-relaxed">
            {snapshot.payoutExplanation}
          </p>
        )}
        {snapshot?.warningExplanation && (
          <p className="text-xs text-warning leading-relaxed">
            {snapshot.warningExplanation}
          </p>
        )}
        <p className="text-[10px] text-ink-tertiary border-t border-line-soft pt-2">
          {snapshot
            ? "Generated from your statement source ledger — no AI inference."
            : "Deterministic explanation — no AI inference."}
        </p>
      </div>
    </Section>
  );
}
