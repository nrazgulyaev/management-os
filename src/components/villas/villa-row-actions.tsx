"use client";

import { useState } from "react";
import { Pencil, Archive } from "lucide-react";
import { EntityModal } from "@/components/forms/entity-modal";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { VillaForm } from "@/features/villas/form";
import { archiveVillaAction } from "@/features/villas/actions";
import type { VillaListItem } from "@/features/villas/services";

/**
 * Stage 6.P0 — per-row actions for the dashboard villas list.
 *
 * Renders Edit + Archive icon buttons. Edit opens the existing
 * VillaForm in a modal (pre-filled from the row data). Archive opens
 * a ConfirmDialog wrapping archiveVillaAction.
 *
 * The full-page create route (/dashboard/villas/new) and edit route
 * (/dashboard/villas/[id]/edit) stay intact — this component just
 * adds a faster modal path from the list view.
 */
export function VillaRowActions({
  villa,
  projects,
}: {
  villa: VillaListItem;
  projects: { id: string; name: string }[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <div
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="rounded-sm w-8 h-8 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-8 md:h-8 inline-flex items-center justify-center text-ink-tertiary hover:text-ink hover:bg-muted transition-colors"
        aria-label={`Edit ${villa.name ?? villa.unitCode}`}
        data-testid="villa-row-edit"
      >
        <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={() => setArchiveOpen(true)}
        className="rounded-sm w-8 h-8 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-8 md:h-8 inline-flex items-center justify-center text-ink-tertiary hover:text-danger hover:bg-danger-weak/40 transition-colors"
        aria-label={`Archive ${villa.name ?? villa.unitCode}`}
        data-testid="villa-row-archive"
      >
        <Archive className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>

      <EntityModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${villa.name ?? villa.unitCode}`}
        size="lg"
      >
        <VillaForm
          mode="edit"
          projects={projects}
          defaults={{
            id: villa.id,
            projectId: villa.projectId,
            unitCode: villa.unitCode,
            slug: villa.slug,
            name: villa.name,
            status: villa.status,
            bedrooms: villa.bedrooms,
            managementModel: villa.managementModel,
            currentNightlyRateUsd: villa.currentNightlyRateUsd,
          }}
          cancelHref="/dashboard/villas"
        />
      </EntityModal>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={`Archive ${villa.name ?? villa.unitCode}?`}
        description="The villa will be marked as archived. Existing bookings stay intact; the villa won't appear in availability searches."
        confirmLabel="Archive"
        action={archiveVillaAction}
        hiddenFields={{ id: villa.id }}
        onSuccess={() => setArchiveOpen(false)}
      />
    </div>
  );
}
