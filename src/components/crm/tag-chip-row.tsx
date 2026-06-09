"use client";

/**
 * CRM-CUSTOM-FIELDS-TAGS — editable tag chip-row (Attio style).
 *
 * Renders the subject's tags as removable chips plus an "add" affordance
 * that opens a small picker: choose an existing org tag, or type a new
 * label (create-and-assign). Tones come from the Badge Layer-B tokens —
 * no raw bg-black/style={{}}.
 *
 * All mutations route through audit-logged server actions; on success we
 * router.refresh() so the server-rendered chip-row reflects the change.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import {
  assignTagAction,
  createAndAssignTagAction,
  removeTagAction,
} from "@/features/crm-custom-fields/actions";

type Tone = React.ComponentProps<typeof Badge>["tone"];
/** Client-local Layer-B colour tokens (mirrors CRM_TAG_COLORS — kept here so
 *  the client bundle never pulls the drizzle schema module). */
type TagColor =
  | "neutral"
  | "accent"
  | "gold"
  | "success"
  | "info"
  | "warning"
  | "danger";

export interface TagChipRowTag {
  id: string;
  label: string;
  color: string;
}

const COLOR_CHOICES: { value: TagColor; label: string }[] = [
  { value: "neutral", label: "Neutral" },
  { value: "accent", label: "Accent" },
  { value: "gold", label: "Gold" },
  { value: "success", label: "Green" },
  { value: "info", label: "Blue" },
  { value: "warning", label: "Amber" },
  { value: "danger", label: "Red" },
];

function asTone(color: string): Tone {
  return (color as Tone) ?? "neutral";
}

export function TagChipRow({
  subjectType,
  subjectId,
  tags,
  orgTags,
  canManage,
}: {
  subjectType: string;
  subjectId: string;
  /** Tags currently on this subject. */
  tags: TagChipRowTag[];
  /** The org's full tag vocabulary, for the picker. */
  orgTags: TagChipRowTag[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [newLabel, setNewLabel] = React.useState("");
  const [newColor, setNewColor] = React.useState<TagColor>("neutral");
  const [error, setError] = React.useState<string | null>(null);

  const assignedIds = new Set(tags.map((t) => t.id));
  const available = orgTags.filter((t) => !assignedIds.has(t.id));

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function onRemove(tagId: string) {
    if (!canManage) return;
    run(() => removeTagAction({ subjectType, subjectId, tagId }));
  }

  function onAssignExisting(tagId: string) {
    run(async () => {
      await assignTagAction({ subjectType, subjectId, tagId });
    });
  }

  function onCreate() {
    const label = newLabel.trim();
    if (!label) return;
    run(async () => {
      await createAndAssignTagAction({
        subjectType,
        subjectId,
        label,
        color: newColor,
      });
      setNewLabel("");
      setNewColor("neutral");
      setPickerOpen(false);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.length === 0 && !canManage && (
        <span className="text-xs text-ink-tertiary">No tags.</span>
      )}
      {tags.map((t) => (
        <span key={t.id} className="inline-flex items-center">
          <Badge tone={asTone(t.color)} className="normal-case">
            {t.label}
            {canManage && (
              <button
                type="button"
                aria-label={`Remove ${t.label}`}
                onClick={() => onRemove(t.id)}
                disabled={pending}
                className="ml-1 -mr-0.5 inline-flex items-center text-current opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" strokeWidth={2} />
              </button>
            )}
          </Badge>
        </span>
      ))}

      {canManage && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPickerOpen(true)}
          disabled={pending}
          className="h-6 px-2 text-xs"
        >
          <Plus className="w-3 h-3" strokeWidth={2} />
          Tag
        </Button>
      )}

      {error && <span className="text-xs text-danger">{error}</span>}

      <Modal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        size="sm"
        ariaLabel="Add tag"
      >
        <ModalHeader
          title="Add a tag"
          description="Pick an existing tag or create a new one."
          onClose={() => setPickerOpen(false)}
        />
        <ModalBody>
          <div className="flex flex-col gap-5">
            {available.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-label">Existing tags</span>
                <div className="flex flex-wrap gap-2">
                  {available.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onAssignExisting(t.id)}
                      disabled={pending}
                      className="inline-flex"
                    >
                      <Badge
                        tone={asTone(t.color)}
                        className="normal-case cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        {t.label}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <span className="text-label">Create a new tag</span>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. VIP, Repeat buyer"
                maxLength={60}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCreate();
                  }
                }}
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {COLOR_CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setNewColor(c.value)}
                    className={
                      "rounded-full transition-transform " +
                      (newColor === c.value
                        ? "ring-2 ring-ink ring-offset-1 ring-offset-surface"
                        : "opacity-70 hover:opacity-100")
                    }
                  >
                    <Badge tone={asTone(c.value)} className="normal-case">
                      {c.label}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => setPickerOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={onCreate} disabled={pending || !newLabel.trim()}>
            Create &amp; add
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
