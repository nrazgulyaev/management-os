/**
 * Platform-admin feature-flags cabinet — client controls.
 *
 * Three client surfaces over the super-admin server actions:
 *   - <NewFlagButton>      "+ New flag" → EntityModal form
 *   - <KillSwitchToggle>   per-row kill switch (flip is_active)
 *   - <RolloutControl>     per-row rollout bump (set 0..100)
 *
 * Audit + state writes happen server-side; the client only orchestrates
 * the form input + result feedback, then router.refresh() on success.
 */

"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  bumpFlagRolloutAction,
  createFeatureFlagAction,
  toggleFlagKillSwitchAction,
} from "@/lib/platform-flags/actions";

const LIFECYCLE_OPTIONS = [
  { value: "internal", label: "Internal" },
  { value: "beta", label: "Beta" },
  { value: "ga", label: "GA" },
  { value: "archived", label: "Archived" },
];

// ============================================================================
// + New flag
// ============================================================================

export function NewFlagButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" strokeWidth={2} />
        New flag
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="New feature flag"
        description="Register a flag in the catalog. Owner + rollout % are editable later. Audit-logged."
        size="lg"
      >
        {open && <NewFlagForm onDone={() => setOpen(false)} />}
      </EntityModal>
    </>
  );
}

function NewFlagForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [flagCode, setFlagCode] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [lifecycleStatus, setLifecycleStatus] = React.useState("internal");
  const [rolloutPercent, setRolloutPercent] = React.useState("0");
  const [description, setDescription] = React.useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const rollout = Number(rolloutPercent);
        if (!Number.isInteger(rollout) || rollout < 0 || rollout > 100) {
          setErr("Rollout % must be an integer 0..100");
          return;
        }
        startTransition(async () => {
          const res = await createFeatureFlagAction({
            flagCode,
            displayName,
            category,
            owner,
            lifecycleStatus,
            rolloutPercent: rollout,
            description,
          });
          if (!res.ok) {
            setErr(res.error ?? "Failed");
            return;
          }
          router.refresh();
          onDone();
        });
      }}
      className="flex flex-col gap-4 px-5 py-5"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Flag code</span>
          <Input
            value={flagCode}
            onChange={(e) => setFlagCode(e.target.value)}
            placeholder="e.g. owner_portal_v2"
            className="font-mono"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Display name</span>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Owner Portal v2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Category</span>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. cabinet / integration / limit"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Owner</span>
          <Input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="e.g. growth-team"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Lifecycle stage</span>
          <Select
            value={lifecycleStatus}
            onChange={(e) => setLifecycleStatus(e.target.value)}
          >
            {LIFECYCLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Rollout %</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={rolloutPercent}
            onChange={(e) => setRolloutPercent(e.target.value)}
            className="font-mono"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-label">Description</span>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What does this flag gate?"
        />
      </label>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create flag"}
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// Kill switch
// ============================================================================

export function KillSwitchToggle({
  flagCode,
  isActive,
}: {
  flagCode: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={isActive ? "destructive" : "secondary"}
        disabled={pending}
        title={
          isActive ? "Kill — disable this flag everywhere" : "Re-activate this flag"
        }
        onClick={() => {
          setErr(null);
          startTransition(async () => {
            const res = await toggleFlagKillSwitchAction(flagCode);
            if (!res.ok) {
              setErr(res.error ?? "Failed");
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "…" : isActive ? "Kill" : "Re-activate"}
      </Button>
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </div>
  );
}

// ============================================================================
// Rollout bump
// ============================================================================

export function RolloutControl({
  flagCode,
  rolloutPercent,
}: {
  flagCode: string;
  rolloutPercent: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = React.useState(String(rolloutPercent));
  const [err, setErr] = React.useState<string | null>(null);

  // Keep local input in sync if the server value changes underneath us.
  React.useEffect(() => {
    setValue(String(rolloutPercent));
  }, [rolloutPercent]);

  const dirty = Number(value) !== rolloutPercent;

  function submit() {
    setErr(null);
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      setErr("0..100");
      return;
    }
    if (n === rolloutPercent) return;
    startTransition(async () => {
      const res = await bumpFlagRolloutAction(flagCode, n);
      if (!res.ok) {
        setErr(res.error ?? "Failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className="w-20 font-mono tabular-nums"
          disabled={pending}
          aria-label={`Rollout percent for ${flagCode}`}
        />
        <span className="text-xs text-ink-tertiary">%</span>
        {dirty && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={submit}
          >
            {pending ? "…" : "Set"}
          </Button>
        )}
      </div>
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </div>
  );
}
