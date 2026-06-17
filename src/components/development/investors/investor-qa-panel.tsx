"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Mail, Copy, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  generateInvestorDraft,
  approveInvestorDraft,
  editAndApproveInvestorDraft,
  rejectInvestorDraft,
  markInvestorDraftSent,
} from "@/lib/development/server/investor-qa-actions";

/**
 * Inline HITL panel on the investor detail page. Two parts:
 *   - "Generate draft" form at the top.
 *   - List of past drafts with per-draft actions.
 */

export interface DraftRow {
  id: string;
  question: string;
  questionLanguage: string | null;
  responseLanguage: string;
  draftResponse: string;
  approvedResponse: string | null;
  status: "draft" | "approved" | "edited_approved" | "rejected" | "sent";
  sentAt: Date | string | null;
  sentVia: string | null;
  generatedAt: Date | string;
}

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  draft: "info",
  approved: "success",
  edited_approved: "success",
  rejected: "warning",
  sent: "neutral",
};

const LANGS = ["en", "ru", "id", "zh"] as const;

export function InvestorQaPanel({
  investorId,
  investorReportingLanguage,
  drafts,
}: {
  investorId: string;
  investorReportingLanguage: string;
  drafts: DraftRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [question, setQuestion] = useState("");
  const [questionLang, setQuestionLang] = useState<string>("en");
  const [responseLang, setResponseLang] = useState<string>(
    LANGS.includes(investorReportingLanguage as (typeof LANGS)[number])
      ? investorReportingLanguage
      : "en",
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-line-soft bg-surface p-4 space-y-3">
        <h4 className="text-sm font-medium">Generate a new draft</h4>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Paste the investor's question here..."
          rows={4}
          className="w-full rounded border border-line-soft p-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-xs text-ink-tertiary">Question lang</span>
            <select
              value={questionLang}
              onChange={(e) => setQuestionLang(e.target.value)}
              className="rounded border border-line-soft px-2 py-1 text-sm"
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs text-ink-tertiary">Response lang</span>
            <select
              value={responseLang}
              onChange={(e) => setResponseLang(e.target.value)}
              className="rounded border border-line-soft px-2 py-1 text-sm"
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            disabled={pending || question.trim().length === 0}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const out = await generateInvestorDraft({
                  investorId,
                  question,
                  questionLanguage: questionLang as (typeof LANGS)[number],
                  responseLanguage: responseLang as (typeof LANGS)[number],
                });
                if (out.status === "failed" || out.status === "budget_exceeded") {
                  setError(out.errorMessage ?? "Generation failed");
                } else {
                  setQuestion("");
                  router.refresh();
                }
              });
            }}
          >
            {pending ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <Sparkles className="w-3 h-3 mr-1" />
            )}
            Generate draft
          </Button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-ink-tertiary">No drafts yet.</p>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraftCard({ draft }: { draft: DraftRow }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(
    draft.approvedResponse ?? draft.draftResponse,
  );
  const [error, setError] = useState<string | null>(null);

  const isFinal = draft.status === "sent" || draft.status === "rejected";
  const finalText =
    draft.approvedResponse && draft.status !== "draft"
      ? draft.approvedResponse
      : draft.draftResponse;

  return (
    <div className="rounded-md border border-line-soft bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[draft.status]}>{draft.status}</Badge>
          <span className="text-[11px] text-ink-tertiary">
            {draft.questionLanguage?.toUpperCase() ?? "?"} →{" "}
            {draft.responseLanguage.toUpperCase()}
          </span>
        </div>
        <span className="text-[11px] text-ink-tertiary">
          {new Date(draft.generatedAt).toLocaleString()}
        </span>
      </div>

      <div className="text-xs text-ink-secondary">
        <span className="font-medium">Q:</span> {draft.question}
      </div>

      <div className="text-sm whitespace-pre-wrap text-ink">
        {editing ? (
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full min-h-[140px] rounded border border-line-soft p-2 text-sm"
          />
        ) : (
          finalText
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {!isFinal && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line-soft">
          {draft.status === "draft" && !editing && (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      await approveInvestorDraft({ draftId: draft.id });
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
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      await rejectInvestorDraft({ draftId: draft.id });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Reject failed");
                    }
                  });
                }}
              >
                Reject
              </Button>
            </>
          )}
          {editing && (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      await editAndApproveInvestorDraft({
                        draftId: draft.id,
                        approvedResponse: editedText,
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
                  setEditedText(draft.draftResponse);
                }}
              >
                Cancel
              </Button>
            </>
          )}
          {(draft.status === "approved" ||
            draft.status === "edited_approved") && (
            <>
              <span className="text-xs text-ink-tertiary mr-1">
                Mark sent:
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await markInvestorDraftSent({
                      draftId: draft.id,
                      sentVia: "email",
                    });
                  })
                }
              >
                <Mail className="w-3 h-3 mr-1" /> Email
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await markInvestorDraftSent({
                      draftId: draft.id,
                      sentVia: "manual_copy",
                    });
                  })
                }
              >
                <Copy className="w-3 h-3 mr-1" /> Copied
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await markInvestorDraftSent({
                      draftId: draft.id,
                      sentVia: "whatsapp",
                    });
                  })
                }
              >
                <MessageSquare className="w-3 h-3 mr-1" /> WhatsApp
              </Button>
            </>
          )}
        </div>
      )}

      {draft.status === "sent" && draft.sentAt && (
        <div className="text-[11px] text-ink-tertiary border-t border-line-soft pt-2">
          Sent {new Date(draft.sentAt).toLocaleString()}
          {draft.sentVia ? ` via ${draft.sentVia}` : ""}
        </div>
      )}
    </div>
  );
}
