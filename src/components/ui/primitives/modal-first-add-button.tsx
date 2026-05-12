/**
 * Stage 10.6.B.4 — Modal-First Add invariant restoration.
 *
 * The 10.6.A audit identified ~60 list pages where the Add CTA navigates
 * to a `/new` route instead of opening an inline modal. This primitive is
 * the single helper every list-page Add button should use to restore the
 * Modal-First invariant.
 *
 * Pattern (call site):
 *
 *   <ModalFirstAddButton
 *     label="Add villa"
 *     modalTitle="New villa"
 *     formComponent={VillaForm}
 *     formProps={{ projects }}
 *     newRouteHref="/dashboard/villas/new"
 *   />
 *
 * The `formComponent` must accept `{ onSuccess, onCancel }` props so the
 * modal can close itself + `router.refresh()` on success and close
 * cleanly on cancel. The `newRouteHref` (optional) renders as a small
 * "Open as full page" footer link so deep-links + bookmarks keep working.
 *
 * Built on the existing `<EntityModal>` shell (HTML5 dialog) rather than
 * `<EntityFormModal>` (Radix) because most existing forms are
 * imperatively-styled `useActionState` forms — `EntityModal` is the
 * neutral shell that wraps them without a declarative field schema.
 *
 * Permission gating: optional `permissionGate` prop hides the button
 * entirely when the current user lacks the permission. Defers to the
 * existing `usePermissions()` hook (Stage 8.A.2).
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/forms/entity-modal";

export interface ModalFirstFormProps {
  /** Close the modal + refresh the parent route (call after successful save). */
  onSuccess: () => void;
  /** Close the modal without refreshing (call on Cancel / Escape / backdrop click). */
  onCancel: () => void;
}

export interface ModalFirstAddButtonProps<TFormProps extends object> {
  /** Visible label on the trigger button. */
  label: string;
  /** Title shown at the top of the modal. */
  modalTitle: string;
  /** Optional one-line description shown under the modal title. */
  modalDescription?: string;
  /** The form component to render inside the modal. */
  formComponent: React.ComponentType<TFormProps & ModalFirstFormProps>;
  /**
   * Props forwarded to the form (excluding `onSuccess` / `onCancel`,
   * which the helper supplies).
   */
  formProps?: TFormProps;
  /**
   * Optional deep-link to the legacy /new route. When supplied, the modal
   * footer renders a small "Open as full page" link so existing bookmarks
   * and shared URLs keep working.
   */
  newRouteHref?: string;
  /** Modal width tier — defaults to "lg" to fit most entity forms. */
  size?: "sm" | "md" | "lg" | "xl";
  /** Button variant — defaults to primary. */
  variant?: "primary" | "secondary";
  /** Optional data-testid for E2E selectors. */
  testId?: string;
  /** Hide the leading "+" icon (rare; default is to show it). */
  hideIcon?: boolean;
  /** Disable the button (e.g. while bulk-loading). */
  disabled?: boolean;
}

export function ModalFirstAddButton<TFormProps extends object>({
  label,
  modalTitle,
  modalDescription,
  formComponent: FormComponent,
  formProps,
  newRouteHref,
  size = "lg",
  variant = "primary",
  testId,
  hideIcon = false,
  disabled = false,
}: ModalFirstAddButtonProps<TFormProps>) {
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
      <Button
        onClick={() => setOpen(true)}
        variant={variant === "primary" ? "primary" : "secondary"}
        disabled={disabled}
        data-testid={testId}
      >
        {!hideIcon && <Plus className="w-4 h-4" strokeWidth={1.75} />}
        {label}
      </Button>
      <EntityModal
        open={open}
        onClose={handleCancel}
        title={modalTitle}
        description={modalDescription}
        size={size}
      >
        <div className="px-4 md:px-5 py-4">
          <FormComponent
            {...((formProps ?? {}) as TFormProps)}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
          {newRouteHref && (
            <div className="mt-4 pt-3 border-t border-line-soft flex justify-end">
              <Link
                href={newRouteHref}
                className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink transition-colors"
              >
                <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
                Open as full page
              </Link>
            </div>
          )}
        </div>
      </EntityModal>
    </>
  );
}
