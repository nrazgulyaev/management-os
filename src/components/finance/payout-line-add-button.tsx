"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import {
  PayoutLineForm,
  type PayoutLineFormOption,
} from "@/components/finance/payout-line-form";

export function PayoutLineAddButton({
  owners,
  batches,
}: {
  owners: PayoutLineFormOption[];
  batches: PayoutLineFormOption[];
}) {
  return (
    <ModalFirstAddButton
      label="New line"
      modalTitle="New payout line"
      modalDescription="Schedule a wire to an owner. Leave unbatched or attach to a batch."
      formComponent={PayoutLineForm}
      formProps={{ owners, batches }}
      variant="secondary"
      size="lg"
      testId="payout-line-add-trigger"
    />
  );
}
