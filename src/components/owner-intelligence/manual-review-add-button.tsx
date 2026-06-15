"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import {
  ManualReviewForm,
  type ManualReviewVillaOption,
} from "@/components/owner-intelligence/manual-review-form";

/**
 * Modal-First Add trigger for a manual guest review. Mounts on the reviews
 * admin page-header. Villa options are passed down from the server page
 * (org-scoped via `listVillas`).
 */
export function ManualReviewAddButton({
  villas,
}: {
  villas: ManualReviewVillaOption[];
}) {
  return (
    <ModalFirstAddButton
      label="Add manual review"
      modalTitle="Add manual review"
      formComponent={ManualReviewForm}
      formProps={{ villas }}
      size="lg"
      testId="manual-review-add-trigger"
    />
  );
}
