"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormShell,
  Field,
  inputCls,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { upsertNeighborhoodPlaceAction } from "@/features/villa-guides/actions";

const CATS = [
  "restaurant",
  "cafe",
  "beach",
  "gym",
  "spa",
  "supermarket",
  "pharmacy",
  "hospital",
  "attraction",
  "nightlife",
  "coworking",
  "transport",
  "other",
] as const;

export function PlaceForm({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(upsertNeighborhoodPlaceAction, null);
  useEffect(() => {
    if (state?.ok && state.placeId) {
      router.push("/dashboard/villa-guides/neighborhood");
    }
  }, [state, router]);
  return (
    <form action={dispatch}>
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <SubmitButton>Save</SubmitButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Villa (optional)">
            <select name="villaId" className={selectCls} defaultValue="">
              <option value="">— project / global —</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project (optional)">
            <select name="projectId" className={selectCls} defaultValue="">
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Category" required>
            <select name="category" required className={selectCls} defaultValue="">
              <option value="">Select…</option>
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name" required>
            <input type="text" name="name" required maxLength={160} className={inputCls} />
          </Field>
          <Field label="Sort order">
            <input type="number" name="sortOrder" min={0} max={1000} defaultValue={0} className={inputCls} />
          </Field>
        </div>
        <Field label="Address">
          <input type="text" name="address" maxLength={500} className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Distance (free text)">
            <input type="text" name="distanceLabel" maxLength={80} className={inputCls} placeholder="e.g. 1.2 km" />
          </Field>
          <Field label="Travel time (free text)">
            <input type="text" name="travelTimeLabel" maxLength={80} className={inputCls} placeholder="e.g. 4 min by scooter" />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Google Maps URL">
            <input type="url" name="googleMapsUrl" className={inputCls} />
          </Field>
          <Field label="Image URL">
            <input type="url" name="imageUrl" className={inputCls} />
          </Field>
        </div>
        <Field label="Description (Markdown)">
          <textarea name="descriptionMd" rows={4} maxLength={2000} className={textareaCls} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="guestVisible" defaultChecked />
          Visible to guest
        </label>
      </FormShell>
    </form>
  );
}
