"use client";

/**
 * Per-row "Edit" trigger for the guest-services catalog.
 *
 * Opens the existing `ServiceEditorForm` inside an `EntityModal` instead of
 * navigating to `/catalog/[id]` — the founder asked to edit a service in a
 * popup rather than a full page. The list row is `CatalogServiceRow`, which
 * `extends GuestService` and spreads the full catalog row, so we already hold
 * every field the editor needs; no extra fetch on open.
 *
 * Price options live on a child table and aren't in this modal — the footer
 * "Open full editor" link deep-links to the full page for that.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import type { GuestService } from "@/lib/db/schema/guest-services";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  ServiceEditorForm,
  type CategoryOption,
  type ProjectOption,
  type VillaOption,
} from "./service-editor";

export function ServiceEditButton({
  service,
  categories,
  projects,
  villas,
}: {
  service: GuestService;
  categories: CategoryOption[];
  projects: ProjectOption[];
  villas: VillaOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  const handleSuccess = React.useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  const handleCancel = React.useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(true)}
        data-testid="guest-service-edit-trigger"
      >
        Edit
      </button>
      <EntityModal
        open={open}
        onClose={handleCancel}
        title={`Edit · ${service.name}`}
        description="Changes save instantly. Use the full editor to manage price options."
        size="xl"
      >
        <div className="px-4 md:px-5 py-4">
          <ServiceEditorForm
            service={service}
            categories={categories}
            projects={projects}
            villas={villas}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
          <div className="mt-4 pt-3 border-t border-line-soft flex justify-end">
            <Link
              href={`/dashboard/guest-services/catalog/${service.id}`}
              className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink transition-colors"
            >
              <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
              Open full editor (options &amp; pricing)
            </Link>
          </div>
        </div>
      </EntityModal>
    </>
  );
}
