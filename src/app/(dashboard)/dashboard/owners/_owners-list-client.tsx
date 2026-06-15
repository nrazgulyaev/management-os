"use client";

/**
 * CRM-SAVED-VIEWS-BULK (#169) — owners list client shell.
 *
 * Owns: row multi-selection, the advanced filter conditions, the active
 * saved view, and live (in-browser) filtering via matchAllConditions. Renders
 * the <CrmFilterBar> + <SavedViewsBar> above the table and the floating
 * <BulkActionBar> below it. Bulk writes + view persistence run through the
 * server actions; the table rows themselves are passed pre-serialized from
 * the server page (no bigint / Date across the boundary).
 *
 * Tokens only; @/components/ui primitives + the existing owner cell
 * components (TierRing / RiskPill / PortalStatusDot / OwnersRowActions).
 */

import * as React from "react";
import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ListTableCard } from "@/components/ui/primitives";
import { TierRing } from "@/components/owners/tier-ring";
import { RiskPill } from "@/components/owners/risk-pill";
import { PortalStatusDot } from "@/components/owners/portal-dot";
import { OwnersRowActions } from "@/components/dashboard/owners/owners-row-actions";
import { CrmFilterBar } from "@/components/crm/crm-filter-bar";
import { OwnerTagsCell, type OwnerRowTag } from "./_owner-tags-cell";
import { SavedViewsBar, ALL_VIEW_ID } from "@/components/crm/saved-views-bar";
import { BulkActionBar } from "@/components/crm/bulk-action-bar";
import {
  matchAllConditions,
  type FilterCondition,
  type FilterFieldDef,
} from "@/features/crm/saved-views/filter-types";
import { matchTagCondition } from "./_owner-tag-filter";
import {
  bulkOwnerStatusAction,
  bulkOwnerTagAction,
  bulkOwnerAssignAction,
} from "@/features/owners/bulk-actions";
import type { SavedViewListItem } from "@/features/crm/saved-views/services";
import type { OwnerTier } from "@/components/owners/tier-ring";
import type { RiskLevel } from "@/components/owners/risk-pill";
import type { PortalStatus } from "@/components/owners/portal-dot";

/** Serializable owner row (no bigint / Date crosses the RSC boundary). */
export interface OwnerRowVM {
  id: string;
  displayName: string;
  legalName: string | null;
  type: string;
  tier: OwnerTier;
  ytdNetLabel: string;
  riskLevel: RiskLevel;
  riskSignalCount: number;
  portalStatus: PortalStatus;
  villaCount: number;
  lastContact: string | null;
  status: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  taxResidency: string | null;
  riskRowClass: string;
  /** Relationship-manager display label (migration 0178), or null when
   *  unassigned. Resolved from owners.assigned_app_user_id on the server. */
  assignedTo: string | null;
  /** CRM tags assigned to this owner (column + filter). */
  tags: OwnerRowTag[];
}

const statusTone: Record<string, "success" | "gold" | "neutral"> = {
  active: "success",
  onboarding: "gold",
  archived: "neutral",
};

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Onboarding" },
  { value: "archived", label: "Archived" },
];

/** Maps each filter field key → the raw cell value on a row. */
function cellFor(row: OwnerRowVM, field: string): unknown {
  switch (field) {
    case "status":
      return row.status;
    case "type":
      return row.type;
    case "tier":
      return row.tier;
    case "riskLevel":
      return row.riskLevel;
    case "portalStatus":
      return row.portalStatus;
    case "nationality":
      return row.nationality;
    case "taxResidency":
      return row.taxResidency;
    case "email":
      return row.email;
    case "displayName":
      return row.displayName;
    default:
      return "";
  }
}

function toCsv(rows: OwnerRowVM[]): string {
  const header = [
    "Name",
    "Legal name",
    "Type",
    "Tier",
    "YTD net",
    "Retention",
    "Portal",
    "Tags",
    "Owner manager",
    "Status",
    "Nationality",
    "Tax residency",
    "Email",
    "Phone",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.displayName,
      r.legalName ?? "",
      r.type,
      r.tier,
      r.ytdNetLabel,
      r.riskLevel,
      r.portalStatus,
      r.tags.map((t) => t.label).join("; "),
      r.assignedTo ?? "",
      r.status,
      r.nationality ?? "",
      r.taxResidency ?? "",
      r.email ?? "",
      r.phone ?? "",
    ]
      .map((v) => esc(String(v)))
      .join(","),
  );
  return [header.map(esc).join(","), ...lines].join("\r\n");
}

export interface OwnersListClientProps {
  rows: OwnerRowVM[];
  fields: FilterFieldDef[];
  savedViews: SavedViewListItem[];
  assignOptions: { id: string; label: string }[];
  canManage: boolean;
  canImpersonate: boolean;
  /** Server action passed from the page (impersonation form). */
  viewAsOwnerAction: (formData: FormData) => void | Promise<void>;
}

export function OwnersListClient({
  rows,
  fields,
  savedViews,
  assignOptions,
  canManage,
  canImpersonate,
  viewAsOwnerAction,
}: OwnersListClientProps) {
  const [conditions, setConditions] = React.useState<FilterCondition[]>([]);
  const [activeViewId, setActiveViewId] = React.useState<string>(ALL_VIEW_ID);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<string | null>(null);

  // Tag conditions need multi-membership semantics (an owner carries MANY
  // tags), so they are matched separately from the single-value cell fields
  // the shared <matchCondition> understands.
  const tagConditions = React.useMemo(
    () => conditions.filter((c) => c.field === "tags"),
    [conditions],
  );
  const scalarConditions = React.useMemo(
    () => conditions.filter((c) => c.field !== "tags"),
    [conditions],
  );

  const filtered = React.useMemo(() => {
    if (conditions.length === 0) return rows;
    return rows.filter((r) => {
      const scalarOk =
        scalarConditions.length === 0 ||
        matchAllConditions(scalarConditions, (f) => cellFor(r, f));
      if (!scalarOk) return false;
      const tagIds = r.tags.map((t) => t.id);
      return tagConditions.every((c) => matchTagCondition(tagIds, c));
    });
  }, [rows, conditions, scalarConditions, tagConditions]);

  // Keep selection in sync with the currently-visible rows.
  const visibleIds = React.useMemo(() => filtered.map((r) => r.id), [filtered]);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  function applyView(view: SavedViewListItem | null) {
    if (!view) {
      setActiveViewId(ALL_VIEW_ID);
      setConditions([]);
      return;
    }
    setActiveViewId(view.id);
    setConditions(view.conditions);
  }

  function runBulk(fn: () => Promise<{ ok: boolean; error?: string; affected?: number }>, verb: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setMessage(res.error ?? "Bulk action failed.");
        return;
      }
      setMessage(`${verb} ${res.affected ?? selectedVisible.length} owner${(res.affected ?? 1) === 1 ? "" : "s"}.`);
      clearSelection();
    });
  }

  function exportCsv() {
    const target = selectedVisible.length > 0 ? rows.filter((r) => selected.has(r.id)) : filtered;
    const csv = toCsv(target);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `owners-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <CrmFilterBar fields={fields} conditions={conditions} onChange={(next) => {
          setConditions(next);
          setActiveViewId(ALL_VIEW_ID);
        }} />
        <SavedViewsBar
          entity="owners"
          views={savedViews}
          activeViewId={activeViewId}
          conditions={conditions}
          canManage={canManage}
          onSelectView={applyView}
        />
      </div>

      <ListTableCard
        eyebrow="Stakeholders"
        title="All owners & investors"
        count={filtered.length}
      >
        <Table>
          <THead>
            <TR>
              <TH className="w-10">
                <Checkbox
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  aria-label="Select all owners"
                />
              </TH>
              <TH>Owner</TH>
              <TH>Tier</TH>
              <TH className="text-right">YTD net</TH>
              <TH>Retention</TH>
              <TH>Portal</TH>
              <TH>Tags</TH>
              <TH>Owner manager</TH>
              <TH>Last contact</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {filtered.map((o) => (
              <TR key={o.id} className={selected.has(o.id) ? "bg-accent-weak/30" : o.riskRowClass}>
                <TD>
                  <Checkbox
                    checked={selected.has(o.id)}
                    onChange={() => toggleRow(o.id)}
                    aria-label={`Select ${o.displayName}`}
                  />
                </TD>
                <TD>
                  <Link
                    href={`/dashboard/owners/${o.id}`}
                    className="text-display text-[14.5px] text-ink hover:text-accent"
                  >
                    {o.displayName}
                  </Link>
                  <div className="text-xs text-ink-tertiary mt-0.5 font-mono">
                    {o.legalName && o.legalName !== o.displayName
                      ? o.legalName
                      : o.type.replace("_", " ")}
                    {o.villaCount > 0 && (
                      <>
                        {" · "}
                        {o.villaCount} villa{o.villaCount === 1 ? "" : "s"}
                      </>
                    )}
                  </div>
                </TD>
                <TD>
                  <TierRing tier={o.tier} verbose />
                </TD>
                <TD className="text-right font-mono text-sm font-medium text-terra">{o.ytdNetLabel}</TD>
                <TD>
                  <RiskPill
                    level={o.riskLevel}
                    reason={
                      o.riskSignalCount > 0
                        ? `${o.riskSignalCount} signal${o.riskSignalCount === 1 ? "" : "s"}`
                        : undefined
                    }
                  />
                </TD>
                <TD>
                  <PortalStatusDot status={o.portalStatus} verbose />
                </TD>
                <TD>
                  <OwnerTagsCell tags={o.tags} />
                </TD>
                <TD>
                  {o.assignedTo ? (
                    <Badge tone="accent">{o.assignedTo}</Badge>
                  ) : (
                    <span className="text-ink-tertiary text-sm">Unassigned</span>
                  )}
                </TD>
                <TD className="text-ink-secondary text-sm font-mono">{o.lastContact ?? "—"}</TD>
                <TD>
                  <Badge tone={statusTone[o.status] ?? "neutral"}>{o.status}</Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canImpersonate && (
                      <form action={viewAsOwnerAction}>
                        <input type="hidden" name="ownerId" value={o.id} />
                        <button
                          type="submit"
                          className="text-xs text-ink-secondary hover:text-terra px-2 py-1 border border-line-soft rounded transition-colors"
                          title="Open this owner's portal view"
                        >
                          View as owner →
                        </button>
                      </form>
                    )}
                    <OwnersRowActions
                      kind="owner"
                      row={{
                        id: o.id,
                        displayName: o.displayName,
                        detailHref: `/dashboard/owners/${o.id}`,
                        values: {
                          type: o.type,
                          displayName: o.displayName,
                          legalName: o.legalName ?? "",
                          email: o.email ?? "",
                          phone: o.phone ?? "",
                          nationality: o.nationality ?? "",
                          taxResidency: o.taxResidency ?? "",
                          status: o.status,
                        },
                      }}
                    />
                  </div>
                </TD>
              </TR>
            ))}
            {filtered.length === 0 && (
              <TR>
                <TD colSpan={11} className="py-10 text-center text-ink-tertiary text-sm">
                  No owners match these filters.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </ListTableCard>

      <BulkActionBar
        selectedCount={selectedVisible.length}
        onClear={clearSelection}
        statusOptions={STATUS_OPTIONS}
        assignOptions={assignOptions}
        busy={busy}
        message={message}
        onStatusChange={(status) =>
          runBulk(() => bulkOwnerStatusAction({ ids: selectedVisible, status: status as "active" | "onboarding" | "archived" }), "Updated")
        }
        onTag={(tag) => runBulk(() => bulkOwnerTagAction({ ids: selectedVisible, tag }), "Tagged")}
        onAssign={(assigneeId) =>
          runBulk(() => bulkOwnerAssignAction({ ids: selectedVisible, assigneeAppUserId: assigneeId }), "Assigned")
        }
        onExportCsv={exportCsv}
      />
    </>
  );
}
