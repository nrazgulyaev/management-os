"use client";

/**
 * <LogActivityComposer> — the write-side of the CRM activity timeline.
 *
 * A small "Log activity" launcher that opens a modal composer for a note /
 * call / email against any CRM record (owner / contact / lead / buyer). Writes
 * through the org-scoped, permission-gated, audit-logged `logCrmActivity`
 * action, then router.refresh() so the freshly-logged entry lands in the
 * <RecordTimeline> beside it.
 *
 * Until now operators could only READ an auto-populated timeline; this lets
 * them populate it by hand. Palette-agnostic Layer-B tokens + @/components/ui
 * primitives only — no raw bg-black / inline style.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { logCrmActivity } from "@/features/crm-activity/actions";
import type { CrmSubjectType } from "@/features/crm-activity/types";
import {
  COMPOSER_KINDS,
  COMPOSER_KIND_LABEL,
  type ComposerKind,
} from "@/features/crm-activity/composer";

export interface LogActivityComposerProps {
  subjectType: CrmSubjectType;
  subjectId: string;
  /** Gates the launcher — only internal users with crm_activity.write. */
  canManage: boolean;
  /** Override the trigger button copy. */
  triggerLabel?: string;
  className?: string;
}

const KIND_HINT: Record<ComposerKind, string> = {
  note: "Capture context — a comment, a decision, an internal observation.",
  call: "Summarise a phone conversation — who, when, the outcome.",
  email: "Log an email you sent or received outside the platform.",
};

export function LogActivityComposer({
  subjectType,
  subjectId,
  canManage,
  triggerLabel = "Log activity",
  className,
}: LogActivityComposerProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<ComposerKind>("note");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (!canManage) return null;

  function reset() {
    setKind("note");
    setTitle("");
    setBody("");
    setError(null);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function onSubmit() {
    const summary = title.trim();
    if (!summary) {
      setError("A summary is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await logCrmActivity({
        subjectType,
        subjectId,
        kind,
        title: summary,
        body: body.trim() ? body.trim() : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className={className}
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
        {triggerLabel}
      </Button>

      <Modal open={open} onOpenChange={onOpenChange} size="md" ariaLabel="Log activity">
        <ModalHeader
          title="Log activity"
          description="Record a note, call, or email on this record's timeline."
          onClose={() => onOpenChange(false)}
        />
        <ModalBody>
          <div className="flex flex-col gap-4">
            <Field label="Kind" htmlFor="crm-activity-kind">
              <Select
                id="crm-activity-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as ComposerKind)}
              >
                {COMPOSER_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {COMPOSER_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Summary" htmlFor="crm-activity-title" help={KIND_HINT[kind]}>
              <Input
                id="crm-activity-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Called to confirm payout schedule"
                maxLength={280}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
              />
            </Field>

            <Field label="Details (optional)" htmlFor="crm-activity-body">
              <Textarea
                id="crm-activity-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Optional — longer context, next steps, quotes…"
                rows={4}
                maxLength={8000}
              />
            </Field>

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending || !title.trim()}>
            {pending ? "Logging…" : "Log activity"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
