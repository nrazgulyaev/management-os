"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { EntityModal } from "./entity-modal";
import { SubmitButton } from "@/components/admin/submit-button";

/**
 * Stage 6.P0 — destructive-action confirm dialog.
 *
 * Wraps a server action in a confirmation modal. Pattern matches the
 * platform's existing useActionState shape: the action is
 * `(prev, formData) => Promise<ActionResult>`. The form fires the
 * action only after the user clicks the destructive button.
 *
 * Pattern (call site):
 *
 *   const [open, setOpen] = useState(false);
 *   <Button variant="ghost" onClick={() => setOpen(true)}>Archive</Button>
 *   <ConfirmDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     title="Archive project?"
 *     description="The project will be hidden from the active list. You can restore it from the archive view."
 *     confirmLabel="Archive"
 *     action={archiveProjectAction}
 *     hiddenFields={{ id: project.id }}
 *   />
 *
 * The action receives a FormData containing every entry in
 * `hiddenFields`. On success the action typically calls
 * `revalidatePath()`; the surrounding modal closes via the parent's
 * onClose after the action returns ok.
 */

type ActionResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; error: string };

type ConfirmAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  action,
  hiddenFields = {},
  destructive = true,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  action: ConfirmAction;
  hiddenFields?: Record<string, string>;
  destructive?: boolean;
  onSuccess?: () => void;
}) {
  const [state, dispatch] = useActionState<ActionResult | null, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (result.ok) onSuccess?.();
      return result;
    },
    null,
  );

  return (
    <EntityModal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
    >
      <form action={dispatch} className="px-5 md:px-6 py-5 flex flex-col gap-4">
        {Object.entries(hiddenFields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}

        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink">
            {state.error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <SubmitButton
            variant={destructive ? "destructive" : "primary"}
            pendingLabel="Working…"
          >
            {confirmLabel}
          </SubmitButton>
        </div>
      </form>
    </EntityModal>
  );
}
