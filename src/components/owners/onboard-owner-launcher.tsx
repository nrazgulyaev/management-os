"use client";

/**
 * mgmt-03 — Onboard-owner launcher.
 *
 * Replaces the flat OwnerForm create path on the owners list with the
 * 3-step OnboardOwnerModal wizard (Identity -> Commission -> Villas +
 * portal). The wizard's identity fields create the owner through the
 * existing `createOwnerAction`. Commission %, villa assignment, and the
 * portal invite are collected by the wizard UI; their share/grant
 * persistence lands in the 2.2 data PR (the create action does not yet
 * consume them). A "full page" fallback link keeps the legacy /new
 * route deep-linkable.
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
import { createOwnerAction } from "@/features/owners/actions";

export function OnboardOwnerLauncher({
  availableVillas,
}: {
  availableVillas: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();

  async function handleSubmit(values: OnboardOwnerValues) {
    const fd = new FormData();
    fd.set("type", "individual");
    fd.set("displayName", values.displayName);
    fd.set("legalName", values.legalName);
    fd.set("email", values.email);
    fd.set("taxResidency", values.taxResidency);
    fd.set("status", "onboarding");

    // createOwnerAction redirects to the new owner on success; on a
    // validation failure it returns { ok: false } and we keep the modal
    // open so the director can correct the highlighted fields.
    const res = await createOwnerAction(null, fd);
    if (!res || res.ok === false) return;
    router.refresh();
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
