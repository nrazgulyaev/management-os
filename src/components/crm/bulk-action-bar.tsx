"use client";

/**
 * CRM-SAVED-VIEWS-BULK (#169) — <BulkActionBar>.
 *
 * Floating action bar shown when ≥1 row is multi-selected. Offers bulk
 * status change / tag / assign / export-CSV. The owner-specific server
 * actions are passed in by the list wrapper so this bar stays entity-generic
 * for the contacts / leads rollout.
 *
 * Tokens only; @/components/ui primitives. Export-CSV is fully client-side.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface BulkAssignOption {
  id: string;
  label: string;
}

export interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  /** Status options for the bulk status menu (value + label). */
  statusOptions: { value: string; label: string }[];
  assignOptions: BulkAssignOption[];
  busy?: boolean;
  message?: string | null;
  onStatusChange: (status: string) => void;
  onTag: (tag: string) => void;
  onAssign: (assigneeId: string) => void;
  onExportCsv: () => void;
}

type Panel = null | "status" | "tag" | "assign";

export function BulkActionBar({
  selectedCount,
  onClear,
  statusOptions,
  assignOptions,
  busy,
  message,
  onStatusChange,
  onTag,
  onAssign,
  onExportCsv,
}: BulkActionBarProps) {
  const [panel, setPanel] = React.useState<Panel>(null);
  const [status, setStatus] = React.useState(statusOptions[0]?.value ?? "");
  const [tag, setTag] = React.useState("");
  const [assignee, setAssignee] = React.useState(assignOptions[0]?.id ?? "");

  if (selectedCount === 0) return null;

  function toggle(next: Panel) {
    setPanel((p) => (p === next ? null : next));
  }

  return (
    <div className="sticky bottom-4 z-20 mx-auto w-fit" data-component="bulk-action-bar">
      <div className="flex items-center gap-2 rounded-full border border-line-soft bg-surface px-3 py-2 shadow-lg">
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-accent px-2 text-[12px] font-semibold text-accent-contrast">
          {selectedCount}
        </span>
        <span className="text-[12.5px] text-ink-secondary">selected</span>
        <div className="mx-1 h-5 w-px bg-line-soft" />

        <BulkButton active={panel === "status"} onClick={() => toggle("status")}>
          Status
        </BulkButton>
        <BulkButton active={panel === "tag"} onClick={() => toggle("tag")}>
          Tag
        </BulkButton>
        {assignOptions.length > 0 && (
          <BulkButton active={panel === "assign"} onClick={() => toggle("assign")}>
            Assign
          </BulkButton>
        )}
        <BulkButton onClick={onExportCsv}>Export CSV</BulkButton>

        <div className="mx-1 h-5 w-px bg-line-soft" />
        <button
          type="button"
          onClick={onClear}
          className="text-[12.5px] text-ink-tertiary hover:text-ink transition-colors"
        >
          Clear
        </button>
      </div>

      {message && (
        <p className="mt-2 text-center text-[12px] text-ink-secondary">{message}</p>
      )}

      {panel === "status" && (
        <Popover>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="New status"
            className="w-full"
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <ApplyButton
            busy={busy}
            onClick={() => {
              onStatusChange(status);
              setPanel(null);
            }}
          />
        </Popover>
      )}

      {panel === "tag" && (
        <Popover>
          <Input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Tag name"
            aria-label="Tag"
          />
          <ApplyButton
            busy={busy}
            disabled={!tag.trim()}
            onClick={() => {
              onTag(tag.trim());
              setTag("");
              setPanel(null);
            }}
          />
        </Popover>
      )}

      {panel === "assign" && (
        <Popover>
          <Select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            aria-label="Assignee"
            className="w-full"
          >
            {assignOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
          <ApplyButton
            busy={busy}
            disabled={!assignee}
            onClick={() => {
              onAssign(assignee);
              setPanel(null);
            }}
          />
        </Popover>
      )}
    </div>
  );
}

function BulkButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-[12.5px] font-medium text-ink-secondary hover:bg-muted hover:text-ink transition-colors",
        active && "bg-muted text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Popover({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-line-soft bg-surface p-2 shadow-lg">
      {children}
    </div>
  );
}

function ApplyButton({
  busy,
  disabled,
  onClick,
}: {
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button size="sm" onClick={onClick} disabled={busy || disabled}>
      {busy ? "Working…" : "Apply"}
    </Button>
  );
}
