"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  generateAnalysisForReport,
  regenerateAnalysisForReport,
  approveAnalysis,
  editAndApproveAnalysis,
  rejectAnalysis,
} from "@/lib/development/server/construction-analysis-actions";

/**
 * Inline HITL card for the Construction Supervisor draft on a site
 * report detail page. Three states:
 *
 *   - No analysis yet → "Generate AI analysis" button.
 *   - Draft analysis  → full-detail card with Approve / Edit /
 *                       Regenerate / Reject actions.
 *   - Approved analysis → read-only summary + audit metadata.
 */

export interface AnalysisProp {
  id: string;
  status: "draft" | "approved" | "edited_approved";
  draftSummary: string;
  safetyStatus: "normal" | "minor_concerns" | "serious_concerns";
  safetyConcerns: string[] | null;
  immediateActionsRecommended: string[] | null;
  recommendedReviewerActions: string[] | null;
  workforceFlags: string[] | null;
  vendorFlags: string[] | null;
  delayRiskFlags: string[] | null;
  estimatedCompletionPercent: string | null;
  onTrackVsBudget: boolean | null;
  reviewedAt: Date | string | null;
  generatedAt: Date | string;
}

const SAFETY_TONE = {
  normal: "success",
  minor_concerns: "warning",
  serious_concerns: "danger",
} as const;

const SAFETY_LABEL = {
  normal: "Normal",
  minor_concerns: "Minor concerns",
  serious_concerns: "Serious concerns",
} as const;

const SAFETY_ICON = {
  normal: ShieldCheck,
  minor_concerns: ShieldQuestion,
  serious_concerns: ShieldAlert,
} as const;

export function ConstructionAnalysisCard({
  reportId,
  analysis,
  reportStatus,
}: {
  reportId: string;
  analysis: AnalysisProp | null;
  reportStatus: string;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState(
    analysis?.draftSummary ?? "",
  );
  const [editedSafety, setEditedSafety] = useState<
    "normal" | "minor_concerns" | "serious_concerns"
  >(analysis?.safetyStatus ?? "normal");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible =
    reportStatus === "submitted" || reportStatus === "reviewed";

  if (!eligible) {
    return (
      <div className="rounded-md border border-line-soft bg-muted/30 p-4 text-sm text-ink-secondary">
        AI analysis is available once the report is submitted.
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-md border border-line-soft bg-surface p-4 space-y-2">
        <p className="text-sm text-ink-secondary">
          No AI analysis has been generated for this report yet.
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const out = await generateAnalysisForReport({ reportId });
              if (out.status === "failed" || out.status === "budget_exceeded") {
                setError(out.errorMessage ?? "Generation failed");
              }
            });
          }}
        >
          {pending ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <Sparkles className="w-3 h-3 mr-1" />
          )}
          Generate AI analysis
        </Button>
      </div>
    );
  }

  const SafetyIcon = SAFETY_ICON[analysis.safetyStatus];
  const isApproved =
    analysis.status === "approved" || analysis.status === "edited_approved";

  return (
    <div className="rounded-md border border-line-soft bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge tone={SAFETY_TONE[analysis.safetyStatus]}>
            <SafetyIcon className="w-3 h-3 mr-1" />
            {SAFETY_LABEL[analysis.safetyStatus]}
          </Badge>
          <Badge tone={isApproved ? "success" : "info"}>
            {analysis.status === "draft"
              ? "Draft"
              : analysis.status === "approved"
                ? "Approved"
                : "Edited & approved"}
          </Badge>
          {analysis.estimatedCompletionPercent && (
            <span className="text-xs text-ink-tertiary">
              {analysis.estimatedCompletionPercent}% complete
            </span>
          )}
          {analysis.onTrackVsBudget != null && (
            <Badge
              tone={analysis.onTrackVsBudget ? "success" : "warning"}
            >
              {analysis.onTrackVsBudget ? "On track" : "Off track"}
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-ink-tertiary">
          {new Date(analysis.generatedAt).toLocaleString()}
        </span>
      </div>

      <div className="text-sm text-ink whitespace-pre-wrap">
        {editing ? (
          <textarea
            value={editedSummary}
            onChange={(e) => setEditedSummary(e.target.value)}
            className="w-full min-h-[120px] rounded border border-line-soft p-2 text-sm"
          />
        ) : (
          analysis.draftSummary
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-2 text-sm">
          <label className="text-xs text-ink-tertiary">Safety:</label>
          {(["normal", "minor_concerns", "serious_concerns"] as const).map(
            (s) => (
              <label
                key={s}
                className="text-xs flex items-center gap-1 cursor-pointer"
              >
                <input
                  type="radio"
                  name="safetyStatus"
                  checked={editedSafety === s}
                  onChange={() => setEditedSafety(s)}
                />
                {SAFETY_LABEL[s]}
              </label>
            ),
          )}
        </div>
      )}

      {analysis.safetyConcerns && analysis.safetyConcerns.length > 0 && (
        <Section title="Safety concerns" items={analysis.safetyConcerns} />
      )}
      {analysis.immediateActionsRecommended &&
        analysis.immediateActionsRecommended.length > 0 && (
          <Section
            title="Immediate actions"
            items={analysis.immediateActionsRecommended}
          />
        )}
      {analysis.workforceFlags && analysis.workforceFlags.length > 0 && (
        <Section title="Workforce flags" items={analysis.workforceFlags} />
      )}
      {analysis.vendorFlags && analysis.vendorFlags.length > 0 && (
        <Section title="Vendor flags" items={analysis.vendorFlags} />
      )}
      {analysis.delayRiskFlags && analysis.delayRiskFlags.length > 0 && (
        <Section title="Delay risks" items={analysis.delayRiskFlags} />
      )}
      {analysis.recommendedReviewerActions &&
        analysis.recommendedReviewerActions.length > 0 && (
          <Section
            title="For the project manager"
            items={analysis.recommendedReviewerActions}
          />
        )}

      {error && <p className="text-xs text-danger">{error}</p>}

      {analysis.status === "draft" && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line-soft">
          {!editing ? (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      await approveAnalysis({ analysisId: analysis.id });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Approve failed");
                    }
                  });
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditing(true)}
              >
                Edit & approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      await regenerateAnalysisForReport({ reportId });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Regenerate failed");
                    }
                  });
                }}
              >
                Regenerate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowReject((v) => !v)}
              >
                Reject
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      await editAndApproveAnalysis({
                        analysisId: analysis.id,
                        edits: {
                          draftSummary: editedSummary,
                          safetyStatus: editedSafety,
                        },
                      });
                      setEditing(false);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Save failed");
                    }
                  });
                }}
              >
                Save edits & approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setEditedSummary(analysis.draftSummary);
                  setEditedSafety(analysis.safetyStatus);
                }}
              >
                Cancel
              </Button>
            </>
          )}
          {showReject && (
            <div className="w-full mt-2 flex items-center gap-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason (required, ≥3 chars)"
                className="flex-1 rounded border border-line-soft p-2 text-sm"
              />
              <Button
                size="sm"
                disabled={pending || rejectReason.trim().length < 3}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      await rejectAnalysis({
                        analysisId: analysis.id,
                        reason: rejectReason,
                      });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Reject failed");
                    }
                  });
                }}
              >
                Confirm reject
              </Button>
            </div>
          )}
        </div>
      )}

      {isApproved && analysis.reviewedAt && (
        <div className="text-[11px] text-ink-tertiary border-t border-line-soft pt-2">
          Reviewed {new Date(analysis.reviewedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h5 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-1">
        {title}
      </h5>
      <ul className="text-xs text-ink-secondary space-y-0.5">
        {items.map((s, i) => (
          <li key={i} className="flex gap-1">
            <span className="text-ink-tertiary">·</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
