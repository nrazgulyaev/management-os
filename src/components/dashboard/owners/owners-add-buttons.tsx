/**
 * Stage 10.F.1 — Owner-stays modal-Add buttons.
 *
 * Replaces audit-flagged `<Link href="/new">` page-nav for the
 * owner-stays policy + equivalence-group surfaces. Each button is a
 * thin wrapper around the existing `create*Action` from
 * src/features/owner-stays/actions.ts.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EntityFormModal,
  type EntityFormField,
} from "@/components/ui/primitives";
import {
  createOwnerStayPolicyAction,
  createEquivalenceGroupAction,
} from "@/features/owner-stays/actions";

interface AddButtonProps {
  label?: string;
  variant?: "primary" | "secondary";
}

function buildFormData(values: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (v == null) fd.append(k, "");
    else if (typeof v === "boolean") fd.append(k, v ? "true" : "false");
    else fd.append(k, String(v));
  }
  return fd;
}

const COMPENSATION_MODELS = [
  { value: "none", label: "None" },
  { value: "fixed_per_night", label: "Fixed per night" },
  { value: "management_fee_on_expected_gross", label: "Mgmt fee on expected gross" },
  { value: "percent_of_expected_gross", label: "% of expected gross" },
];

const OPERATIONAL_COST_MODELS = [
  { value: "none", label: "None" },
  { value: "actual_costs", label: "Actual costs" },
  { value: "fixed_per_stay", label: "Fixed per stay" },
  { value: "fixed_per_night", label: "Fixed per night" },
];

const POLICY_FIELDS: EntityFormField<Record<string, unknown>>[] = [
  { name: "policyName", label: "Policy name", required: true, span: 2 },
  { name: "freeNightsPerYear", label: "Free nights / year", type: "number", required: true },
  { name: "freeNightsApplyToPeak", label: "Apply free nights to peak season", type: "checkbox" },
  { name: "requiresApproval", label: "Requires approval", type: "checkbox" },
  { name: "allowDisplacingGuestBookings", label: "Allow displacing guest bookings", type: "checkbox" },
  { name: "relocationAllowed", label: "Relocation allowed", type: "checkbox" },
  {
    name: "operationalCostModel",
    label: "Operational cost model",
    type: "select",
    options: OPERATIONAL_COST_MODELS,
  },
  {
    name: "compensationModel",
    label: "Compensation model",
    type: "select",
    options: COMPENSATION_MODELS,
  },
  {
    name: "compensationPercent",
    label: "Compensation %",
    type: "number",
    helper: "Used when compensation model is 'percent of expected gross'.",
  },
  { name: "currency", label: "Currency (3-letter)", placeholder: "USD" },
];

const EQUIV_GROUP_FIELDS: EntityFormField<Record<string, unknown>>[] = [
  { name: "name", label: "Group name", required: true, span: 2 },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    span: 2,
    helper: "Optional. Free text describing the swap-comparable set.",
  },
];

export function AddOwnerStayPolicyButton(props: AddButtonProps = {}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  async function handleSubmit(values: Record<string, unknown>) {
    const fd = buildFormData({
      ...values,
      // sensible defaults for required-by-schema fields the modal omits
      freeNightsPerYear: values.freeNightsPerYear ?? 14,
    });
    const res = await createOwnerStayPolicyAction(null, fd);
    if (!res.ok) throw new Error(res.error ?? "Create failed");
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant={props.variant ?? "primary"}
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        {props.label ?? "+ New policy"}
      </Button>
      <EntityFormModal
        open={open}
        onOpenChange={setOpen}
        title="Add owner stay policy"
        description="Per-villa or per-project rules: free nights, blackout, approval, compensation model, operational cost."
        fields={POLICY_FIELDS}
        initialValues={{
          freeNightsPerYear: 14,
          requiresApproval: true,
          relocationAllowed: true,
          operationalCostModel: "actual_costs",
          compensationModel: "management_fee_on_expected_gross",
        }}
        onSubmit={handleSubmit}
        submitLabel="Create policy"
      />
    </>
  );
}

export function AddEquivalenceGroupButton(props: AddButtonProps = {}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  async function handleSubmit(values: Record<string, unknown>) {
    const fd = buildFormData(values);
    const res = await createEquivalenceGroupAction(null, fd);
    if (!res.ok) throw new Error(res.error ?? "Create failed");
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant={props.variant ?? "primary"}
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        {props.label ?? "+ New group"}
      </Button>
      <EntityFormModal
        open={open}
        onOpenChange={setOpen}
        title="Add equivalence group"
        description="Group swap-comparable villas so the relocation engine can move bookings between them with same-or-better quality rank."
        fields={EQUIV_GROUP_FIELDS}
        onSubmit={handleSubmit}
        submitLabel="Create group"
      />
    </>
  );
}
