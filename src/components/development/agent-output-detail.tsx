import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { AgentOutputReviewControls } from "@/components/development/agent-output-review-controls";

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  awaiting_review: "warning",
  approved: "success",
  partially_approved: "info",
  rejected: "danger",
  edited_and_approved: "success",
  expired: "neutral",
};

export interface AgentOutputDetailProps {
  output: {
    outputCode: string;
    agentKey: string;
    title: string;
    summary: string;
    detailedOutput: unknown;
    recommendedActions: string[];
    affectedEntities: unknown;
    confidenceLevel: string | null;
    reasoningSummary: string | null;
    status: string;
    reviewerNotes: string | null;
    editedSummary: string | null;
    editedActions: string[] | null;
    actionsExecuted: boolean;
    actionsExecutedAt: Date | string | null;
    createdAt: Date | string;
  };
  backHref: string;
}

export function AgentOutputDetail({
  output,
  backHref,
}: AgentOutputDetailProps) {
  return (
    <>
      <Section title="Status">
        <div className="flex flex-wrap gap-2">
          <Badge tone={STATUS_TONE[output.status] ?? "neutral"}>
            status: {output.status}
          </Badge>
          {output.confidenceLevel && (
            <Badge tone="neutral">
              confidence: {output.confidenceLevel}
            </Badge>
          )}
          {output.actionsExecuted && (
            <Badge tone="success">actions executed</Badge>
          )}
        </div>
      </Section>

      <Section title="Summary">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {output.editedSummary ?? output.summary}
        </p>
      </Section>

      {output.recommendedActions.length > 0 && (
        <Section title="Recommended actions">
          <ul className="list-disc pl-5 text-sm">
            {(output.editedActions && output.editedActions.length > 0
              ? output.editedActions
              : output.recommendedActions
            ).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      )}

      {output.reasoningSummary && (
        <Section title="Reasoning">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {output.reasoningSummary}
          </p>
        </Section>
      )}

      <Section title="Detailed output">
        <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 p-3 rounded">
          {JSON.stringify(output.detailedOutput, null, 2)}
        </pre>
      </Section>

      {output.affectedEntities != null && (
        <Section title="Affected entities">
          <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 p-3 rounded">
            {JSON.stringify(output.affectedEntities, null, 2)}
          </pre>
        </Section>
      )}

      {output.reviewerNotes && (
        <Section title="Reviewer notes">
          <p className="text-sm leading-relaxed">{output.reviewerNotes}</p>
        </Section>
      )}

      {output.status === "awaiting_review" && (
        <Section title="Review this output">
          <AgentOutputReviewControls
            outputCode={output.outputCode}
            currentSummary={output.editedSummary ?? output.summary}
            currentActions={
              output.editedActions && output.editedActions.length > 0
                ? output.editedActions
                : output.recommendedActions
            }
          />
        </Section>
      )}

      <div className="mt-6">
        <Button asChild variant="secondary">
          <Link href={backHref}>
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </Button>
      </div>
    </>
  );
}
