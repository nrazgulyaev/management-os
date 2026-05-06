"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  archiveOrganization,
  updateOrganizationModules,
} from "@/lib/development/server/organizations/organization-actions";

const ALL_MODULES = [
  "development",
  "rentals",
  "investors",
  "buyers",
  "qa_qc",
  "inventory",
  "schedule",
  "marketing",
  "ai_agents",
] as const;

export function OrganizationSettingsForm({
  organizationCode,
  enabledModules,
  isActive,
}: {
  organizationCode: string;
  enabledModules: string[];
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modules, setModules] = useState<Set<string>>(new Set(enabledModules));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

  const toggle = (m: string) => {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const save = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateOrganizationModules({
        organizationCode,
        enabledModules: [...modules],
      });
      if (result.ok) {
        setMessage("Modules updated.");
        router.refresh();
      } else {
        setError(result.error ?? "Update failed");
      }
    });
  };

  const archive = () => {
    if (!confirmingArchive) {
      setConfirmingArchive(true);
      return;
    }
    if (archiveReason.trim().length < 3) {
      setError("Reason is required (3+ chars)");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await archiveOrganization({
        organizationCode,
        reason: archiveReason.trim(),
      });
      if (result.ok) {
        setMessage("Organization archived.");
        setConfirmingArchive(false);
        router.refresh();
      } else {
        setError(result.error ?? "Archive failed");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-ink-tertiary">
          Enabled modules
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {ALL_MODULES.map((m) => (
            <label
              key={m}
              className="flex items-center gap-2 text-xs rounded-md border border-line-soft px-2 py-1.5 cursor-pointer hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={modules.has(m)}
                disabled={pending || !isActive}
                onChange={() => toggle(m)}
                data-testid={`org-module-${m}`}
              />
              <span>{m}</span>
            </label>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending || !isActive}
          onClick={save}
          data-testid="org-modules-save"
        >
          {pending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
          Save modules
        </Button>
      </div>

      {isActive && (
        <div className="rounded-md border border-danger/40 bg-danger/5 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-danger">
            Archive organization
          </div>
          <p className="text-xs text-ink-secondary">
            Archived orgs are read-only — users can no longer log in. The reason
            is recorded on the organization row.
          </p>
          {confirmingArchive && (
            <input
              type="text"
              placeholder="Reason for archive"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              className="w-full rounded-md border border-line-soft bg-surface px-2 py-1 text-xs"
              data-testid="org-archive-reason"
            />
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={archive}
            data-testid="org-archive-trigger"
          >
            {pending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            {confirmingArchive ? "Confirm archive" : "Archive…"}
          </Button>
          {confirmingArchive && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingArchive(false)}
            >
              Cancel
            </Button>
          )}
        </div>
      )}

      {message && <p className="text-xs text-success">{message}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
