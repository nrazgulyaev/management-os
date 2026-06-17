"use client";

/**
 * MISSING_CRUD closure — WhatsApp template approval-status advance.
 *
 * Mirrors the marketing ContentStatusControl pattern (valid next-state
 * chips + useTransition + router.refresh). Drives
 * `setTemplateApprovalStatus`. Approving requires a Twilio Content SID
 * (HX…) because `sendWhatsAppTemplateMessage` sends via ContentSid and
 * refuses any template whose approval_status !== 'approved'. Rejecting
 * captures a reason.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { setTemplateApprovalStatus } from "@/lib/development/server/whatsapp-credentials-actions";

// Forward lifecycle: draft → pending_approval → approved; either of
// the first two can be rejected; approved/rejected can be retired to
// inactive; inactive can be reactivated to draft.
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_approval", "approved", "rejected", "inactive"],
  pending_approval: ["approved", "rejected", "inactive"],
  approved: ["inactive"],
  rejected: ["draft", "inactive"],
  inactive: ["draft"],
};

const LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Submit",
  approved: "Approve",
  rejected: "Reject",
  inactive: "Retire",
};

export function TemplateStatusControl({
  templateId,
  status,
  twilioTemplateSid,
}: {
  templateId: string;
  status: string;
  twilioTemplateSid: string | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [mode, setMode] = React.useState<null | "approve" | "reject">(null);
  const [err, setErr] = React.useState<string | null>(null);

  const next = VALID_TRANSITIONS[status] ?? [];
  if (next.length === 0) return null;

  function go(
    newStatus: string,
    extra?: { twilioTemplateSid?: string; rejectionReason?: string },
  ) {
    setErr(null);
    start(async () => {
      try {
        await setTemplateApprovalStatus({
          id: templateId,
          approvalStatus: newStatus as
            | "draft"
            | "pending_approval"
            | "approved"
            | "rejected"
            | "inactive",
          twilioTemplateSid: extra?.twilioTemplateSid ?? null,
          rejectionReason: extra?.rejectionReason ?? null,
        });
        setMode(null);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Transition failed.");
      }
    });
  }

  const chip =
    "font-mono text-[9.5px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border border-line-soft bg-surface text-ink-secondary hover:border-line hover:text-ink disabled:opacity-50";
  const okChip =
    "font-mono text-[9.5px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border border-success/40 bg-surface text-success hover:bg-success/5 disabled:opacity-50";
  const dangerChip =
    "font-mono text-[9.5px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5 disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        {next.map((s) => {
          if (s === "approved") {
            return (
              <button
                key={s}
                type="button"
                className={okChip}
                disabled={pending}
                onClick={() => {
                  setErr(null);
                  setMode("approve");
                }}
              >
                {LABEL[s]}
              </button>
            );
          }
          if (s === "rejected") {
            return (
              <button
                key={s}
                type="button"
                className={dangerChip}
                disabled={pending}
                onClick={() => {
                  setErr(null);
                  setMode("reject");
                }}
              >
                {LABEL[s]}
              </button>
            );
          }
          return (
            <button
              key={s}
              type="button"
              className={chip}
              disabled={pending}
              onClick={() => go(s)}
            >
              {LABEL[s] ?? s}
            </button>
          );
        })}
      </div>

      {mode === "approve" && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const sid = (
              new FormData(e.currentTarget).get("sid") ?? ""
            )
              .toString()
              .trim();
            go("approved", { twilioTemplateSid: sid });
          }}
        >
          <input
            name="sid"
            required
            minLength={2}
            defaultValue={twilioTemplateSid ?? ""}
            placeholder="Twilio Content SID (HX…)"
            className="text-[10px] px-1.5 py-0.5 rounded border border-line-soft bg-surface w-[200px]"
          />
          <button type="submit" className={okChip} disabled={pending}>
            OK
          </button>
        </form>
      )}

      {mode === "reject" && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = (
              new FormData(e.currentTarget).get("reason") ?? ""
            ).toString();
            go("rejected", { rejectionReason: reason });
          }}
        >
          <input
            name="reason"
            required
            minLength={2}
            placeholder="Rejection reason"
            className="text-[10px] px-1.5 py-0.5 rounded border border-line-soft bg-surface w-[200px]"
          />
          <button type="submit" className={dangerChip} disabled={pending}>
            OK
          </button>
        </form>
      )}

      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}
