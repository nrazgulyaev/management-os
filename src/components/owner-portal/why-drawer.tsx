"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { EXPLAINERS } from "@/features/owner-statements/explainers";

/**
 * Phase 2.3 owner-02 — WhyDrawer.
 *
 * Side drawer that surfaces category explainer text. Built on
 * Radix Dialog with right-side positioning. Keeps the underlying
 * statement detail readable so the owner can cross-reference.
 */

export interface WhyDrawerProps {
  /** Active category key (set by WhyLink). Null = closed. */
  categoryKey: string | null;
  onOpenChange: (open: boolean) => void;
}

export function WhyDrawer({ categoryKey, onOpenChange }: WhyDrawerProps) {
  const open = categoryKey !== null;
  const explainer = categoryKey ? EXPLAINERS[categoryKey] : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="why-drawer-overlay" />
        <Dialog.Content className="why-drawer">
          <Dialog.Title asChild>
            <h3>{explainer?.title ?? "Explainer"}</h3>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p className="why-drawer-lede">
              {explainer?.lede ?? "Pick a line to learn more about it."}
            </p>
          </Dialog.Description>
          {explainer?.body && (
            <div className="why-drawer-body">
              {explainer.body.split(/\n\n+/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
          {explainer?.example && (
            <div className="why-drawer-example">
              <div className="ft mono">Example</div>
              {explainer.example}
            </div>
          )}
          <button
            type="button"
            className="why-drawer-close btn btn-secondary btn-sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
