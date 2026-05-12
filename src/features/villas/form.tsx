"use client";

import Link from "next/link";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { createVillaAction, updateVillaAction } from "./actions";
import type { ActionResult } from "@/features/projects/actions";

export interface VillaFormDefaults {
  id?: string;
  projectId?: string;
  unitCode?: string;
  slug?: string;
  name?: string | null;
  status?: string;
  bedrooms?: number;
  bathrooms?: number | null;
  builtAreaSqm?: number | null;
  landAreaSqm?: number | null;
  poolAreaSqm?: number | null;
  viewType?: string | null;
  managementModel?: string;
  currentNightlyRateUsd?: number | null;
}

export function VillaForm({
  mode,
  projects,
  defaults,
  defaultProjectId,
  cancelHref = "/dashboard/villas",
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  projects: { id: string; name: string }[];
  defaults?: VillaFormDefaults;
  defaultProjectId?: string;
  cancelHref?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const action = mode === "edit" ? updateVillaAction : createVillaAction;
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    action,
    { onSuccess },
  );
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const v = defaults ?? {};

  return (
    <form action={submitAction}>
      {mode === "edit" && v.id && <input type="hidden" name="id" value={v.id} />}
      <FormShell
        title={mode === "edit" ? "Edit villa" : "Villa details"}
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href={cancelHref}>Cancel</Link>
              </Button>
            )}
            <SubmitButton>{mode === "edit" ? "Save changes" : "Create villa"}</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Project" required error={errs.projectId?.[0]}>
            <select
              name="projectId"
              required
              defaultValue={v.projectId ?? defaultProjectId ?? ""}
              className={selectCls}
            >
              <option value="" disabled>
                Pick a project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unit code" required error={errs.unitCode?.[0]}>
            <input
              name="unitCode"
              required
              defaultValue={v.unitCode}
              className={inputCls}
              placeholder="ES-S5"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Slug" required error={errs.slug?.[0]}>
            <input
              name="slug"
              required
              defaultValue={v.slug}
              className={inputCls}
              placeholder="enso-s5"
            />
          </Field>
          <Field label="Display name" error={errs.name?.[0]}>
            <input
              name="name"
              defaultValue={v.name ?? ""}
              className={inputCls}
              placeholder="Enso S5"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Status" required hint="Operational state · archived hides from boards">
            <select name="status" defaultValue={v.status ?? "ready"} className={selectCls}>
              {[
                "ready",
                "available",
                "occupied",
                "checkout_pending",
                "cleaning",
                "inspection",
                "maintenance_blocked",
                "owner_stay",
                "out_of_service",
                "archived",
              ].map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bedrooms" required>
            <input
              name="bedrooms"
              type="number"
              min={0}
              defaultValue={v.bedrooms ?? 3}
              className={inputCls}
            />
          </Field>
          <Field label="Bathrooms">
            <input
              name="bathrooms"
              type="number"
              min={0}
              step="0.5"
              defaultValue={v.bathrooms ?? undefined}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Built area · m²">
            <input
              name="builtAreaSqm"
              type="number"
              min={0}
              step="0.1"
              defaultValue={v.builtAreaSqm ?? undefined}
              className={inputCls}
            />
          </Field>
          <Field label="Land area · m²">
            <input
              name="landAreaSqm"
              type="number"
              min={0}
              step="0.1"
              defaultValue={v.landAreaSqm ?? undefined}
              className={inputCls}
            />
          </Field>
          <Field label="Pool area · m²">
            <input
              name="poolAreaSqm"
              type="number"
              min={0}
              step="0.1"
              defaultValue={v.poolAreaSqm ?? undefined}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="View type">
            <input
              name="viewType"
              defaultValue={v.viewType ?? ""}
              className={inputCls}
              placeholder="ocean / rice_field / jungle / garden"
            />
          </Field>
          <Field
            label="Management model"
            required
            hint="individual = one owner · pooled = shared yield · hybrid = villa-specific revenue with shared costs"
          >
            <select
              name="managementModel"
              defaultValue={v.managementModel ?? "individual"}
              className={selectCls}
            >
              <option value="individual">Individual</option>
              <option value="pooled">Pooled</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </Field>
          <Field label="Current nightly rate · USD">
            <input
              name="currentNightlyRateUsd"
              type="number"
              min={0}
              step="0.01"
              defaultValue={v.currentNightlyRateUsd ?? undefined}
              className={inputCls}
            />
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
