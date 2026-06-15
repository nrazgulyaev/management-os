"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { EntityModal } from "@/components/forms/entity-modal";
import { PreferenceForm, type PreferenceFormValues } from "./preference-form";

/**
 * Per-row "Edit" affordance for the notification-preferences table.
 * Opens an EntityModal hosting <PreferenceForm> pre-filled with the row,
 * which posts the row `id` so `updateNotificationPreferenceAction` takes
 * its upsert UPDATE path. On success the modal closes + the route
 * refreshes (same contract as ModalFirstAddButton).
 *
 * Rendered only when the page has already established
 * `hasPermission(ctx, "notifications.manage")`.
 */
export function PreferenceEditButton({ row }: { row: PreferenceFormValues }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleSuccess = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  const handleCancel = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-sm btn-ghost inline-flex items-center gap-1.5"
      >
        <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
        Edit
      </button>
      <EntityModal
        open={open}
        onClose={handleCancel}
        title="Edit preference"
        size="lg"
      >
        <div className="px-4 md:px-5 py-4">
          <PreferenceForm
            initial={row}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        </div>
      </EntityModal>
    </>
  );
}
