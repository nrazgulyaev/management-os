"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Archive, ArchiveRestore } from "lucide-react";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

function Submit({
  pendingLabel,
  children,
  variant,
}: {
  pendingLabel: string;
  children: React.ReactNode;
  variant?: "secondary" | "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant ?? "secondary"}
      disabled={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function ArchiveButton({
  id,
  action,
  archived,
}: {
  id: string;
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  archived: boolean;
}) {
  const [state, dispatch] = useActionState(action, initial);
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      {archived ? (
        <Submit pendingLabel="Restoring…">
          <ArchiveRestore className="w-3.5 h-3.5" strokeWidth={1.75} />
          Restore
        </Submit>
      ) : (
        <Submit pendingLabel="Archiving…" variant="destructive">
          <Archive className="w-3.5 h-3.5" strokeWidth={1.75} />
          Archive
        </Submit>
      )}
      {state && !state.ok && (
        <span className="ml-3 text-xs text-danger self-center">{state.error}</span>
      )}
    </form>
  );
}
