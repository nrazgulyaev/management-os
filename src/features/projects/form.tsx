"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import {
  createProjectAction,
  updateProjectAction,
  type ActionResult,
} from "./actions";

const initial: ActionResult | null = null;

export interface ProjectFormDefaults {
  id?: string;
  slug?: string;
  name?: string;
  concept?: string | null;
  location?: string;
  area?: string | null;
  description?: string | null;
  status?: string;
  managementStatus?: string;
  totalVillas?: number | null;
  targetHandoverDate?: string | null;
  leaseholdUntil?: string | null;
}

export function ProjectForm({
  mode,
  defaults,
  cancelHref = "/dashboard/projects",
}: {
  mode: "create" | "edit";
  defaults?: ProjectFormDefaults;
  cancelHref?: string;
}) {
  const action = mode === "edit" ? updateProjectAction : createProjectAction;
  const [state, dispatch] = useActionState(action, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const v = defaults ?? {};

  return (
    <form action={dispatch}>
      {mode === "edit" && v.id && <input type="hidden" name="id" value={v.id} />}
      <FormShell
        title={mode === "edit" ? "Edit project" : "Project details"}
        description="All fields marked with * are required."
        footer={
          <>
            <Button asChild variant="ghost">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
            <SubmitButton>{mode === "edit" ? "Save changes" : "Create project"}</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Name" required error={errs.name?.[0]}>
            <input
              name="name"
              required
              defaultValue={v.name}
              className={inputCls}
              placeholder="Eternal Villas"
            />
          </Field>
          <Field label="Slug" required hint="Lowercase, hyphen-separated" error={errs.slug?.[0]}>
            <input
              name="slug"
              required
              defaultValue={v.slug}
              className={inputCls}
              placeholder="eternal-villas"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Location" required error={errs.location?.[0]}>
            <input
              name="location"
              required
              defaultValue={v.location}
              className={inputCls}
              placeholder="Bali · Ubud"
            />
          </Field>
          <Field label="Area" error={errs.area?.[0]}>
            <input
              name="area"
              defaultValue={v.area ?? ""}
              className={inputCls}
              placeholder="Ubud"
            />
          </Field>
        </div>

        <Field label="One-line concept" hint="Used in portfolio cards" error={errs.concept?.[0]}>
          <input
            name="concept"
            defaultValue={v.concept ?? ""}
            className={inputCls}
            placeholder="Six residences above the Ayung valley"
          />
        </Field>

        <Field
          label="Description"
          hint="Long-form copy for the project page"
          error={errs.description?.[0]}
        >
          <textarea
            name="description"
            rows={4}
            defaultValue={v.description ?? ""}
            className={textareaCls}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Status" required hint="Lifecycle stage of the project" error={errs.status?.[0]}>
            <select
              name="status"
              defaultValue={v.status ?? "active"}
              className={selectCls}
            >
              <option value="planning">Planning</option>
              <option value="under_construction">Under construction</option>
              <option value="active">Active</option>
              <option value="managed">Managed</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field
            label="Management status"
            required
            hint="Where the project sits in the management funnel"
            error={errs.managementStatus?.[0]}
          >
            <select
              name="managementStatus"
              defaultValue={v.managementStatus ?? "managed"}
              className={selectCls}
            >
              <option value="lead">Lead</option>
              <option value="onboarding">Onboarding</option>
              <option value="managed">Managed</option>
              <option value="paused">Paused</option>
              <option value="exited">Exited</option>
            </select>
          </Field>
          <Field label="Total villas" error={errs.totalVillas?.[0]}>
            <input
              name="totalVillas"
              type="number"
              min={0}
              defaultValue={v.totalVillas ?? undefined}
              className={inputCls}
              placeholder="6"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Target handover date" error={errs.targetHandoverDate?.[0]}>
            <input
              name="targetHandoverDate"
              type="date"
              defaultValue={v.targetHandoverDate ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Leasehold until" error={errs.leaseholdUntil?.[0]}>
            <input
              name="leaseholdUntil"
              type="date"
              defaultValue={v.leaseholdUntil ?? ""}
              className={inputCls}
            />
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
