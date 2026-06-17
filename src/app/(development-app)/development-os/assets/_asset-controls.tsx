"use client";

/**
 * Assets cabinet — create + row-edit client islands.
 *
 * Posts to the "use server" adapters in ./_actions.ts, which wrap the
 * org-scoped asset CRUD actions. No authority is added here; the actions
 * re-verify the asset's org-owning project. Attributes are entered as a
 * freeform "key: value" textarea (one per line) and parsed server-side
 * into the assetAttributes JSONB.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RowActionsMenu } from "@/components/ui/primitives";
import { EntityModal } from "@/components/forms/entity-modal";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import {
  createAssetAction,
  updateAssetAttributesAction,
  changeAssetTypeAction,
} from "./_actions";

const VILLA_STATUSES = [
  "available",
  "occupied",
  "checkout_pending",
  "cleaning",
  "inspection",
  "ready",
  "maintenance_blocked",
  "owner_stay",
  "out_of_service",
  "archived",
] as const;

export interface AssetProjectOption {
  id: string;
  label: string;
}
export interface AssetTypeOption {
  typeKey: string;
  label: string;
}

/** Render a JSONB attributes record as "key: value" lines for the textarea. */
function attributesToText(attrs: Record<string, unknown> | null | undefined): string {
  if (!attrs) return "";
  return Object.entries(attrs)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// New asset (header button + modal)
// ---------------------------------------------------------------------------

export function NewAssetForm({
  projects,
  assetTypes,
}: {
  projects: AssetProjectOption[];
  assetTypes: AssetTypeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    const projectId = String(formData.get("projectId") ?? "").trim();
    const assetTypeKey = String(formData.get("assetTypeKey") ?? "").trim();
    const unitCode = String(formData.get("unitCode") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const status = String(formData.get("status") ?? "ready");
    const attributesText = String(formData.get("attributesText") ?? "");
    const bedroomsRaw = String(formData.get("bedrooms") ?? "").trim();
    const areaRaw = String(formData.get("builtAreaSqm") ?? "").trim();

    if (!projectId) {
      setError("Pick a project.");
      return;
    }
    if (!assetTypeKey) {
      setError("Pick an asset type.");
      return;
    }

    startTransition(async () => {
      const r = await createAssetAction({
        projectId,
        assetTypeKey,
        unitCode,
        slug,
        name: name || null,
        status,
        attributesText,
        ...(bedroomsRaw !== "" && Number.isFinite(Number(bedroomsRaw))
          ? { bedrooms: Number(bedroomsRaw) }
          : {}),
        ...(areaRaw !== "" && Number.isFinite(Number(areaRaw))
          ? { builtAreaSqm: Number(areaRaw) }
          : {}),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        New asset
      </Button>

      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="New asset"
        size="md"
      >
        <form
          action={handleSubmit}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Project" required>
              <select name="projectId" required defaultValue="" className={selectCls}>
                <option value="" disabled>
                  Select…
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Asset type" required>
              <select
                name="assetTypeKey"
                required
                defaultValue=""
                className={selectCls}
              >
                <option value="" disabled>
                  Select…
                </option>
                {assetTypes.map((t) => (
                  <option key={t.typeKey} value={t.typeKey}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit code" required hint="Unique within the portfolio">
              <input name="unitCode" required placeholder="A-12" className={inputCls} />
            </Field>
            <Field label="Slug" required hint="URL-safe handle">
              <input name="slug" required placeholder="villa-a-12" className={inputCls} />
            </Field>
            <Field label="Name">
              <input name="name" placeholder="Garden Villa A-12" className={inputCls} />
            </Field>
            <Field label="Status" required>
              <select name="status" required defaultValue="ready" className={selectCls}>
                {VILLA_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bedrooms">
              <input
                name="bedrooms"
                type="number"
                min={0}
                step={1}
                className={inputCls}
              />
            </Field>
            <Field label="Built area (m²)">
              <input
                name="builtAreaSqm"
                type="number"
                min={0}
                step="any"
                className={inputCls}
              />
            </Field>
          </div>
          <Field
            label="Attributes"
            hint="One per line, e.g. view_type: ocean / has_pool: true"
          >
            <textarea
              name="attributesText"
              rows={3}
              placeholder={"view_type: ocean\nhas_pool: true"}
              className={textareaCls}
            />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Creating…">
              Create asset
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Per-row: Edit attributes / Change type
// ---------------------------------------------------------------------------

export function AssetRowActions({
  assetId,
  unitCode,
  currentTypeKey,
  attributes,
  assetTypes,
}: {
  assetId: string;
  unitCode: string;
  currentTypeKey: string;
  attributes: Record<string, unknown> | null;
  assetTypes: AssetTypeOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [typeOpen, setTypeOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submitAttributes(formData: FormData) {
    setError(null);
    const attributesText = String(formData.get("attributesText") ?? "");
    startTransition(async () => {
      const r = await updateAssetAttributesAction({ assetId, attributesText });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditOpen(false);
      router.refresh();
    });
  }

  function submitType(formData: FormData) {
    setError(null);
    const newAssetTypeKey = String(formData.get("newAssetTypeKey") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    startTransition(async () => {
      const r = await changeAssetTypeAction({ assetId, newAssetTypeKey, reason });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTypeOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <RowActionsMenu
        actions={[
          {
            id: "edit-attrs",
            label: "Edit attributes",
            icon: Pencil,
            onSelect: () => {
              setError(null);
              setEditOpen(true);
            },
          },
          {
            id: "change-type",
            label: "Change type",
            icon: Shuffle,
            separatorBefore: true,
            onSelect: () => {
              setError(null);
              setTypeOpen(true);
            },
          },
        ]}
      />

      <EntityModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${unitCode} attributes`}
        size="md"
      >
        <form
          action={submitAttributes}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <Field
            label="Attributes"
            hint="One per line: key: value. This replaces the full attribute set."
          >
            <textarea
              name="attributesText"
              rows={6}
              defaultValue={attributesToText(attributes)}
              className={textareaCls}
            />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Saving…">
              Save attributes
            </SubmitButton>
          </div>
        </form>
      </EntityModal>

      <EntityModal
        open={typeOpen}
        onClose={() => setTypeOpen(false)}
        title={`Change type — ${unitCode}`}
        size="md"
      >
        <form
          action={submitType}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <p className="text-sm text-ink-secondary">
            Changing an asset&apos;s type is operationally significant and
            requires an audit reason.
          </p>
          <Field label="New asset type" required>
            <select
              name="newAssetTypeKey"
              required
              defaultValue={currentTypeKey}
              className={selectCls}
            >
              {assetTypes.map((t) => (
                <option key={t.typeKey} value={t.typeKey}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason" required>
            <textarea
              name="reason"
              required
              minLength={1}
              rows={2}
              placeholder="Why is this asset being re-typed?"
              className={textareaCls}
            />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTypeOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Changing…">
              Change type
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Gap 5 — filter bar (category chips + type select + clear)
// ---------------------------------------------------------------------------

export function AssetFilterBar({
  categories,
  types,
  activeCategory,
  activeType,
}: {
  categories: string[];
  types: AssetTypeOption[];
  activeCategory?: string;
  activeType?: string;
}) {
  const router = useRouter();

  function setParam(key: "category" | "type", value: string | null) {
    const params = new URLSearchParams();
    // Preserve the other param.
    if (key === "category") {
      if (value) params.set("category", value);
      if (activeType) params.set("type", activeType);
    } else {
      if (activeCategory) params.set("category", activeCategory);
      if (value) params.set("type", value);
    }
    const qs = params.toString();
    router.push(`/development-os/assets${qs ? `?${qs}` : ""}`);
  }

  const hasFilter = Boolean(activeCategory || activeType);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-label mr-1">Category</span>
      {categories.map((c) => {
        const on = activeCategory === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => setParam("category", on ? null : c)}
            className={
              on
                ? "rounded-full border border-ink bg-ink px-3 py-1 text-xs font-medium text-surface"
                : "rounded-full border border-line-soft bg-surface px-3 py-1 text-xs text-ink hover:bg-muted/40"
            }
            aria-pressed={on}
          >
            {c}
          </button>
        );
      })}

      <label className="ml-2 flex items-center gap-2 text-xs text-ink-secondary">
        Type
        <select
          value={activeType ?? ""}
          onChange={(e) => setParam("type", e.target.value || null)}
          className="rounded-md border border-line-soft bg-canvas px-2 h-8 text-xs text-ink"
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.typeKey} value={t.typeKey}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {hasFilter && (
        <button
          type="button"
          onClick={() => router.push("/development-os/assets")}
          className="ml-1 rounded-full border border-line-soft bg-surface px-3 py-1 text-xs text-ink-secondary hover:bg-muted/40"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
