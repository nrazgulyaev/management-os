"use client";

/**
 * Phase 2.1 PR 2 — Bookings list client wrapper (proof-of-life for
 * template 04 ListPage shell).
 *
 * Owns selection + sort + filter state on the client. The parent
 * server page resolves the row data, formats it (no `bigint` across
 * the RSC boundary), and hands it down as a plain array. The FilterBar
 * URL-syncs `?status=`/`?channel=`/`?date=` via `useRouter().replace`;
 * the parent server page reads those on next render for SSR
 * filtering once a real filter resolver lands.
 *
 * Bulk actions are no-ops in this proof-of-life — they alert() to
 * confirm the wire-through and write nothing. Wiring real mutations
 * is a 2.2 task.
 */

import * as React from "react";
import { FilterBar, type FilterDef } from "@/components/dashboard/filter-bar";
import { BulkBar, type BulkAction } from "@/components/dashboard/bulk-bar";
import { SortableHeader, type SortDirection } from "@/components/ui/sortable-header";
import { PagerNumbered } from "@/components/ui/pager-numbered";
import { EmptyState } from "@/components/ui/empty-state";
import { ListPage } from "@/components/dashboard/list-page";
import type { ActiveFilter } from "@/lib/url-state";
import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";

export interface BookingRowVM {
  id: string;
  bookingCode: string;
  villaCode: string;
  channelName: string | null;
  guestName: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  grossUsdFormatted: string;
  status: string;
}

interface BookingsListClientProps {
  rows: BookingRowVM[];
  initialActive: ActiveFilter[];
}

const STATE_BADGE: Record<string, { tone?: "ok" | "info" | "gold" | "warn"; label: string }> = {
  confirmed: { tone: "ok", label: "Confirmed" },
  checked_in: { tone: "gold", label: "In-house" },
  checked_out: { tone: "warn", label: "Checked out" },
  inquiry: { label: "Inquiry" },
  tentative: { label: "Tentative" },
  cancelled: { label: "Cancelled" },
  no_show: { label: "No show" },
};

function initials(name: string | null): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .filter((p) => p && /[A-Za-z]/.test(p[0]))
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const FILTER_DEFS: FilterDef[] = [
  {
    key: "status",
    label: "Status",
    options: [
      { value: "confirmed", label: "Confirmed" },
      { value: "checked_in", label: "In-house" },
      { value: "checked_out", label: "Checked out" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  {
    key: "channel",
    label: "Channel",
    options: [
      { value: "airbnb", label: "Airbnb" },
      { value: "booking", label: "Booking.com" },
      { value: "direct", label: "Direct" },
      { value: "agoda", label: "Agoda" },
    ],
  },
  {
    key: "date",
    label: "Date",
    multi: false,
    options: [
      { value: "this-month", label: "This month" },
      { value: "next-30", label: "Next 30 days" },
      { value: "last-30", label: "Last 30 days" },
      { value: "all", label: "All time" },
    ],
  },
];

export function BookingsListClient({ rows, initialActive }: BookingsListClientProps) {
  const [active, setActive] = React.useState<ActiveFilter[]>(initialActive);
  const [sortDir, setSortDir] = React.useState<SortDirection>("desc");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

  const sorted = React.useMemo(() => {
    if (sortDir === null) return rows;
    const out = [...rows].sort((a, b) => a.bookingCode.localeCompare(b.bookingCode));
    return sortDir === "desc" ? out.reverse() : out;
  }, [rows, sortDir]);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  const bulkActions: BulkAction[] = [
    { id: "move", label: "Move to project", onRun: () => alert(`Move ${selected.size} → project (PR 2 proof-of-life)`) },
    { id: "edit", label: "Bulk edit", onRun: () => alert(`Bulk edit ${selected.size} (PR 2 proof-of-life)`) },
    { id: "export", label: `Export ${selected.size}`, onRun: () => alert(`Export ${selected.size} (PR 2 proof-of-life)`) },
    { id: "cancel", label: "Cancel bookings", danger: true, onRun: () => alert(`Cancel ${selected.size} (PR 2 proof-of-life)`) },
  ];

  const topBar = selected.size > 0 ? (
    <BulkBar
      selectedCount={selected.size}
      actions={bulkActions}
      onClear={() => setSelected(new Set())}
    />
  ) : (
    <FilterBar
      filters={FILTER_DEFS}
      active={active}
      onChange={setActive}
      searchPlaceholder="Search villa, guest, code…"
    />
  );

  return (
    <ListPage header={null} topBar={topBar}>
      {rows.length === 0 ? (
        <EmptyState
          variant="first-run"
          title="No bookings yet"
          body="Add a villa to your portfolio first, then bookings will sync from Airbnb, Booking.com and direct."
          actions={
            <>
              <Link href="/dashboard/villas" className="btn btn-primary btn-sm">
                Add a villa
              </Link>
              <Link href="/dashboard/channels" className="btn btn-secondary btn-sm">
                Connect channels →
              </Link>
            </>
          }
        />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th className="cb">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  aria-label="Select all on this page"
                />
              </th>
              <SortableHeader
                column="bookingCode"
                direction={sortDir}
                onToggle={setSortDir}
              >
                Code
              </SortableHeader>
              <th>Guest</th>
              <th>Villa</th>
              <th>Channel</th>
              <th>Stay</th>
              <th className="num">Nights</th>
              <th className="num">Gross</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const badge = STATE_BADGE[b.status] ?? { label: b.status };
              const isSelected = selected.has(b.id);
              return (
                <tr
                  key={b.id}
                  style={isSelected ? { background: "color-mix(in oklab, var(--terra) 5%, transparent)" } : undefined}
                >
                  <td className="cb">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(b.id)}
                      aria-label={`Select ${b.bookingCode}`}
                    />
                  </td>
                  <td className="mono text-[11px] text-ink-3">{b.bookingCode}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="w-[26px] h-[26px] rounded-full bg-muted border border-line flex items-center justify-center text-[10px]">
                        {initials(b.guestName)}
                      </span>
                      <span>{b.guestName ?? "Guest"}</span>
                    </div>
                  </td>
                  <td className="mono">{b.villaCode}</td>
                  <td className="text-ink-3">{b.channelName ?? "Direct"}</td>
                  <td className="mono text-[12px]">
                    {b.checkIn} → {b.checkOut}
                  </td>
                  <td className="num">{b.nights}</td>
                  <td className="num">{b.grossUsdFormatted}</td>
                  <td>
                    <HandoffBadge tone={badge.tone}>{badge.label}</HandoffBadge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {rows.length > 0 && (
        <PagerNumbered
          total={rows.length}
          page={1}
          perPage={20}
          urlKeyPrefix=""
        />
      )}
    </ListPage>
  );
}
