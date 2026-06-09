"use client";

/**
 * CRM-SAVED-VIEWS-BULK (#169) — saved-view switcher / save / delete.
 *
 * Right-aligned dropdown that switches between the synthetic "All" default
 * and persisted views (private + org-shared). "Save view" opens a modal that
 * captures the CURRENT filter conditions under a name (+ org-shared toggle).
 *
 * Persistence runs through the server actions; this component is presentation
 * + a thin client transition. Tokens only; @/components/ui primitives.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  saveCrmViewAction,
  deleteCrmViewAction,
} from "@/features/crm/saved-views/actions";
import type { SavedViewListItem } from "@/features/crm/saved-views/services";
import type {
  CrmSavedViewEntity,
} from "@/lib/db/schema/crm-saved-views";
import type { FilterCondition } from "@/features/crm/saved-views/filter-types";

/** Synthetic id for the always-present "show everything" view. */
export const ALL_VIEW_ID = "__all__";

export interface SavedViewsBarProps {
  entity: CrmSavedViewEntity;
  views: SavedViewListItem[];
  activeViewId: string;
  /** Current filter conditions (what "Save view" snapshots). */
  conditions: FilterCondition[];
  canManage: boolean;
  onSelectView: (view: SavedViewListItem | null) => void;
}

function useOutside(open: boolean, close: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);
  return ref;
}

export function SavedViewsBar({
  entity,
  views,
  activeViewId,
  conditions,
  canManage,
  onSelectView,
}: SavedViewsBarProps) {
  const [open, setOpen] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const ref = useOutside(open, () => setOpen(false));

  const active = views.find((v) => v.id === activeViewId);
  const activeLabel = active?.name ?? "All";

  function handleDelete(view: SavedViewListItem) {
    startTransition(async () => {
      await deleteCrmViewAction({ id: view.id, entity });
      if (view.id === activeViewId) onSelectView(null);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div ref={ref} className="relative">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="text-ink-tertiary text-[11px] uppercase tracking-[0.1em] mr-1">
            View
          </span>
          <span className="font-medium">{activeLabel}</span>
          <span aria-hidden className="ml-1 text-ink-tertiary">⌄</span>
        </Button>
        {open && (
          <div className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-line-soft bg-surface p-1 shadow-lg" role="menu">
            <ViewRow
              label="All"
              sub="No filters"
              active={activeViewId === ALL_VIEW_ID}
              onClick={() => {
                onSelectView(null);
                setOpen(false);
              }}
            />
            {views.length > 0 && <div className="my-1 h-px bg-line-soft" />}
            {views.map((v) => (
              <ViewRow
                key={v.id}
                label={v.name}
                sub={
                  v.isShared
                    ? "Shared with org"
                    : `${v.conditions.length} filter${v.conditions.length === 1 ? "" : "s"}`
                }
                active={activeViewId === v.id}
                deletable={canManage && v.isMine}
                deleting={pending}
                onClick={() => {
                  onSelectView(v);
                  setOpen(false);
                }}
                onDelete={() => handleDelete(v)}
              />
            ))}
          </div>
        )}
      </div>
      {canManage && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSaveOpen(true)}
          className="text-ink-secondary"
        >
          Save view
        </Button>
      )}

      <SaveViewModal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        entity={entity}
        conditions={conditions}
        onSaved={(view) => onSelectView(view)}
      />
    </div>
  );
}

function ViewRow({
  label,
  sub,
  active,
  deletable,
  deleting,
  onClick,
  onDelete,
}: {
  label: string;
  sub: string;
  active: boolean;
  deletable?: boolean;
  deleting?: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-muted transition-colors",
        active && "bg-accent-weak/50",
      )}
    >
      <button type="button" onClick={onClick} className="flex-1 text-left">
        <div className="text-[13px] text-ink font-medium">{label}</div>
        <div className="text-[11px] text-ink-tertiary">{sub}</div>
      </button>
      {deletable && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Delete ${label} view`}
          className="grid h-6 w-6 place-items-center rounded-md text-ink-tertiary hover:bg-danger-weak hover:text-danger transition-colors disabled:opacity-40"
        >
          ×
        </button>
      )}
    </div>
  );
}

function SaveViewModal({
  open,
  onOpenChange,
  entity,
  conditions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: CrmSavedViewEntity;
  conditions: FilterCondition[];
  onSaved: (view: SavedViewListItem) => void;
}) {
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setName("");
      setShared(false);
      setError(null);
    }
  }, [open]);

  function save() {
    if (!name.trim()) {
      setError("Give the view a name.");
      return;
    }
    startTransition(async () => {
      const res = await saveCrmViewAction({
        entity,
        name: name.trim(),
        conditions,
        columns: null,
        isShared: shared,
        isDefault: false,
      });
      if (!res.ok || !res.viewId) {
        setError(res.error ?? "Could not save the view.");
        return;
      }
      onSaved({
        id: res.viewId,
        entity,
        name: name.trim(),
        conditions,
        columns: null,
        isShared: shared,
        isDefault: false,
        isMine: true,
      });
      onOpenChange(false);
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" ariaLabel="Save view">
      <ModalHeader
        title="Save this view"
        description={`Capture the current filters as a reusable ${entity} view.`}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-ink-tertiary">
          View name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. At-risk owners"
          autoFocus
        />
        <div className="mt-3">
          <Checkbox
            label="Share with everyone in my organization"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
          />
        </div>
        <p className="mt-3 text-[12px] text-ink-tertiary">
          {conditions.length === 0
            ? "No filters applied — this view shows everything."
            : `${conditions.length} filter condition${conditions.length === 1 ? "" : "s"} will be saved.`}
        </p>
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save view"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
