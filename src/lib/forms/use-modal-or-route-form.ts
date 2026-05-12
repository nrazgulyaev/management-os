/**
 * Stage 10.6.B.4 — Shared form submit hook for Modal-First migration.
 *
 * Every list-page Add form in this codebase currently follows the same
 * shape: `useActionState(action)` + form action={dispatch}. When the
 * action succeeds, it `redirect()`s to a detail page. That's fine on
 * the /new route, but wrong inside a modal — we want the modal to
 * close + the parent list to refresh, NOT a hard navigation.
 *
 * This hook encapsulates both modes so each form's diff is minimal:
 *
 *   const { state, submitAction, pending } = useModalOrRouteForm(
 *     mode === "edit" ? updateVillaAction : createVillaAction,
 *     { onSuccess },
 *   );
 *   return <form action={submitAction}>…</form>;
 *
 * Behavior:
 *  - When `onSuccess` is provided (modal mode): submits via a manual
 *    transition that calls the action directly. If the action throws a
 *    Next.js redirect signal (the existing success-path), the hook
 *    treats that as success and calls `onSuccess` (which closes the
 *    modal + router.refresh()). Field errors render via `state`.
 *  - When `onSuccess` is absent (route mode): falls back to the
 *    standard `useActionState` dispatch — the redirect propagates and
 *    Next.js navigates as before.
 *
 * The form components don't need any per-mode branching beyond passing
 * `onSuccess` through.
 */
"use client";

import { useActionState, useState, useTransition } from "react";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export interface ActionResultShape {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export interface UseModalOrRouteFormOptions {
  /**
   * Provided in modal mode. When the action succeeds (returns ok=true
   * OR throws a Next.js redirect signal), the hook calls this callback
   * instead of letting the redirect propagate.
   */
  onSuccess?: () => void;
}

export interface UseModalOrRouteFormReturn<TResult extends ActionResultShape> {
  /** Latest action result (null until the action runs). */
  state: TResult | null;
  /** Pass to `<form action={...}>` — handles modal-mode or route-mode automatically. */
  submitAction: (formData: FormData) => void | Promise<void>;
  /** True while the modal-mode transition is in flight. Route-mode pending is handled by useActionState/SubmitButton. */
  pending: boolean;
  /** True when `onSuccess` was supplied (modal mode). */
  isModal: boolean;
}

export function useModalOrRouteForm<TResult extends ActionResultShape>(
  action: (
    prevState: TResult | null,
    formData: FormData,
  ) => Promise<TResult>,
  options: UseModalOrRouteFormOptions = {},
): UseModalOrRouteFormReturn<TResult> {
  const { onSuccess } = options;
  const isModal = onSuccess != null;

  const [routeState, dispatch] = useActionState<TResult | null, FormData>(
    action,
    null,
  );
  const [modalState, setModalState] = useState<TResult | null>(null);
  const [pending, startTransition] = useTransition();

  function modalSubmit(formData: FormData) {
    startTransition(async () => {
      setModalState(null);
      try {
        const result = await action(null, formData);
        if (!result.ok) {
          setModalState(result);
          return;
        }
        onSuccess?.();
      } catch (err) {
        if (isRedirectError(err)) {
          // Action redirected on success (existing pattern). In modal
          // context, suppress the navigation and just close + refresh.
          onSuccess?.();
          return;
        }
        throw err;
      }
    });
  }

  return {
    state: isModal ? modalState : routeState,
    submitAction: isModal ? modalSubmit : dispatch,
    pending,
    isModal,
  };
}
