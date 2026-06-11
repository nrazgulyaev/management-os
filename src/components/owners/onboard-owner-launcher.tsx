"use client";

/**
 * mgmt-03 — Onboard-owner launcher.
 *
 * Drives the 3-step OnboardOwnerModal wizard (Identity → Commission →
 * Villas + portal). On finish it calls `onboardOwnerAction`, which persists
 * EVERYTHING the wizard collects in one org-scoped flow: the owner identity,
 * the commission % (owners.commission_pct), one active ownership_share per
 * assigned villa, and an honest portal-invite record. The action returns the
 * new owner id so we navigate straight to their detail page. A "full page"
 * fallback link keeps the legacy /new route deep-linkable.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OnboardOwnerModal,
  type OnboardOwnerValues,
} from "@/components/owners/onboard-modal";
import { onboardOwnerAction } from "@/features/owners/actions";

export function OnboardOwnerLauncher({
  availableVillas,
}: {
  availableVillas: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();

  async function handleSubmit(values: OnboardOwnerValues) {
    // onboardOwnerAction persists identity + commission + villa shares +
    // portal-invite intent and returns the new owner id. On a validation
    // failure it returns { ok: false } and we keep the modal open so the
    // director can correct the highlighted fields.
    const res = await onboardOwnerAction({
      displayName: values.displayName,
      legalName: values.legalName,
      email: values.email,
      taxResidency: values.taxResidency,
      commissionPct: values.commissionPct,
      villaIds: values.villaIds,
      invitePortal: values.invitePortal,
    });
    if (!res || res.ok === false) return;
    if (res.ownerId) {
      router.push(`/dashboard/owners/${res.ownerId}`);
    } else {
      router.refresh();
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="owner-add-trigger">
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        New owner
      </Button>
      <OnboardOwnerModal
        open={open}
        onOpenChange={setOpen}
        availableVillas={availableVillas}
        onSubmit={(values) =>
          new Promise<void>((resolve) => {
            startTransition(async () => {
              await handleSubmit(values);
              resolve();
            });
          })
        }
      />
      {open && (
        <div className="sr-only">
          <Link href="/dashboard/owners/new">
            <ExternalLink className="w-3 h-3" /> Open as full page
          </Link>
        </div>
      )}
    </>
  );
}
