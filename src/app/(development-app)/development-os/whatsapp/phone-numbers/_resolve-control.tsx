"use client";

/**
 * MISSING_CRUD closure — resolve an unknown inbound WhatsApp number to
 * a known platform entity.
 *
 * Drives `resolvePhoneNumber` (sets resolved_entity_type /
 * resolved_entity_id and promotes the row from `unknown` → `recipient`,
 * matching the inbound phone-resolver's canonical entity types).
 * Mirrors the reveal-form pattern of the marketing status controls.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { resolvePhoneNumber } from "@/lib/development/server/whatsapp-credentials-actions";

const ENTITY_TYPES = [
  { value: "app_user", label: "Staff (app user)" },
  { value: "investor", label: "Investor" },
  { value: "vendor", label: "Vendor" },
  { value: "contact", label: "Contact" },
] as const;

type EntityType = (typeof ENTITY_TYPES)[number]["value"];

export function ResolveControl({
  phoneId,
  resolvedEntityType,
  resolvedEntityId,
}: {
  phoneId: string;
  resolvedEntityType: string | null;
  resolvedEntityId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [editing, setEditing] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const isResolved = resolvedEntityType != null && resolvedEntityId != null;

  const chip =
    "font-mono text-[9.5px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border border-line-soft bg-surface text-ink-secondary hover:border-line hover:text-ink disabled:opacity-50";
  const dangerChip =
    "font-mono text-[9.5px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5 disabled:opacity-50";

  function clear() {
    setErr(null);
    start(async () => {
      try {
        await resolvePhoneNumber({
          id: phoneId,
          resolvedEntityType: null,
          resolvedEntityId: null,
        });
        setEditing(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to clear resolution.");
      }
    });
  }

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const entityType = String(fd.get("entityType") ?? "") as EntityType;
    const entityId = String(fd.get("entityId") ?? "").trim();
    const displayName = String(fd.get("displayName") ?? "").trim();
    setErr(null);
    start(async () => {
      try {
        await resolvePhoneNumber({
          id: phoneId,
          resolvedEntityType: entityType,
          resolvedEntityId: entityId,
          displayName: displayName || null,
        });
        setEditing(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to resolve.");
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-1">
          <button
            type="button"
            className={chip}
            disabled={pending}
            onClick={() => {
              setErr(null);
              setEditing(true);
            }}
          >
            {isResolved ? "Re-resolve" : "Resolve"}
          </button>
          {isResolved && (
            <button
              type="button"
              className={dangerChip}
              disabled={pending}
              onClick={clear}
            >
              Clear
            </button>
          )}
        </div>
        {err && <span className="text-[10px] text-danger">{err}</span>}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      <select
        name="entityType"
        required
        defaultValue={(resolvedEntityType as EntityType) ?? ""}
        className="text-[10px] px-1.5 py-0.5 rounded border border-line-soft bg-surface w-[150px]"
      >
        <option value="" disabled>
          Entity type…
        </option>
        {ENTITY_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <input
        name="entityId"
        required
        defaultValue={resolvedEntityId ?? ""}
        placeholder="Entity UUID"
        className="text-[10px] px-1.5 py-0.5 rounded border border-line-soft bg-surface w-[150px] font-mono"
      />
      <input
        name="displayName"
        placeholder="Display name (optional)"
        className="text-[10px] px-1.5 py-0.5 rounded border border-line-soft bg-surface w-[150px]"
      />
      <div className="flex gap-1">
        <button
          type="button"
          className={chip}
          disabled={pending}
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
        <button type="submit" className={chip} disabled={pending}>
          Save
        </button>
      </div>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </form>
  );
}
