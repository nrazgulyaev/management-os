"use client";

/**
 * Wire-up (dev-OS drawings gap §2) — "Log distribution" trigger on the
 * drawing distribution page.
 *
 * The distribution log was read-only: logDrawingDistribution existed
 * server-side with no UI trigger. This mounts an <EntityFormModal>-driven
 * Add that posts to the already-org-scoped, audited logDrawingDistribution
 * typed-input action.
 *
 * revisionId is chosen from this drawing's revisions; vendorId from a vendor
 * picker; distributionMethod from the action's enum. The server re-validates
 * (revision+vendor uniqueness, org scope) — this is a UX layer, not the
 * authority.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  EntityFormModal,
  type EntityFormField,
} from "@/components/ui/primitives";
import { logDrawingDistribution } from "@/lib/development/server/drawings/drawing-actions";

const METHOD_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "physical_print", label: "Physical print" },
  { value: "platform_download", label: "Platform download" },
  { value: "other", label: "Other" },
];

type DistributionMethod =
  | "whatsapp"
  | "email"
  | "physical_print"
  | "platform_download"
  | "other";

interface LogDistributionButtonProps {
  revisions: Array<{ id: string; revisionLabel: string; status: string }>;
  vendors: Array<{ id: string; label: string }>;
}

export function LogDistributionButton({
  revisions,
  vendors,
}: LogDistributionButtonProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  const revisionOptions = React.useMemo(
    () =>
      revisions.map((r) => ({
        value: r.id,
        label: `Rev ${r.revisionLabel} · ${r.status.replace(/_/g, " ")}`,
      })),
    [revisions],
  );

  const vendorOptions = React.useMemo(
    () => vendors.map((v) => ({ value: v.id, label: v.label })),
    [vendors],
  );

  const fields: EntityFormField<Record<string, unknown>>[] = React.useMemo(
    () => [
      {
        name: "revisionId",
        label: "Revision",
        type: "select",
        required: true,
        options: revisionOptions,
        span: 2,
      },
      {
        name: "vendorId",
        label: "Vendor",
        type: "select",
        required: true,
        options: vendorOptions,
        span: 2,
      },
      {
        name: "distributionMethod",
        label: "Method",
        type: "select",
        required: true,
        options: METHOD_OPTIONS,
        span: 2,
      },
      {
        name: "notes",
        label: "Notes",
        type: "textarea",
        span: 2,
        placeholder: "Optional context (e.g. recipient, sent via …)",
      },
    ],
    [revisionOptions, vendorOptions],
  );

  async function handleSubmit(values: Record<string, unknown>) {
    await logDrawingDistribution({
      revisionId: String(values.revisionId ?? ""),
      vendorId: String(values.vendorId ?? ""),
      distributionMethod: String(
        values.distributionMethod ?? "",
      ) as DistributionMethod,
      notes: values.notes ? String(values.notes).trim() : null,
    });
    router.refresh();
  }

  const disabled = revisions.length === 0 || vendors.length === 0;
  const disabledTitle =
    revisions.length === 0
      ? "Add a revision before logging distribution"
      : vendors.length === 0
        ? "Register a vendor before logging distribution"
        : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabledTitle}
        className="btn btn-secondary btn-sm disabled:opacity-50"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Log distribution
      </button>
      <EntityFormModal
        open={open}
        onOpenChange={setOpen}
        title="Log distribution"
        description="Record that a revision was sent to a vendor so the chain of custody is preserved."
        fields={fields}
        initialValues={{
          revisionId: revisions[0]?.id ?? "",
          vendorId: vendors[0]?.id ?? "",
          distributionMethod: "whatsapp",
        }}
        onSubmit={handleSubmit}
        submitLabel="Log distribution"
      />
    </>
  );
}
