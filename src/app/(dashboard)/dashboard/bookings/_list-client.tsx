"use client";

/**
 * Bookings list client — mgmt-p1/bookings prototype.
 *
 * Owns selection + sort + filter state on the client and filters the
 * rows live: the FilterBar chips (status / channel / date) and the
 * search box now actually narrow the table (no server round-trip).
 * Channel column renders brand-tinted pills; rows tint by arrival
 * state (arriving / departing / in-stay); the status cell derives an
 * arrival-centric badge from status + dates.
 *
 * Bulk actions remain proof-of-life (alert/no-op) pending the 2.2
 * mutation wiring.
 */

import * as React from "react";
import { FilterBar, type FilterDef } from "@/components/dashboard/filter-bar";
import { BulkBar, type BulkAction } from "@/components/dashboard/bulk-bar";
import { SortableHeader, type SortDirection } from "@/components/ui/sortable-header";
import { PagerNumbered } from "@/components/ui/pager-numbered";
import { EmptyState } from "@/components/ui/empty-state";
import { ListPage } from "@/components/dashboard/list-page";
import { DestructiveConfirmModal } from "@/components/ui/modal";
import type { ActiveFilter } from "@/lib/url-state";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HandoffBadge } from "@/components/dashboard/primitives";

export interface BookingRowVM {
  id: string;
  bookingCode: string;
  villaCode: string;
  channelKey: string | null;
  channelName: string | null;
  guestName: string | null;
  /** Raw ISO YYYY-MM-DD (the client formats + derives arrival state). */
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

// ---- channel pill ---------------------------------------------------------
function channelPill(key: string | null, name: string | null): { cls: string; label: string } {
  const k = (key ?? "").toLowerCase();
  if (k.includes("airbnb")) return { cls: "airbnb", label: "AIRBNB" };
  if (k.includes("booking")) return { cls: "bcom", label: "BOOKING.COM" };
  if (k.includes("agoda")) return { cls: "agoda", label: "AGODA" };
  if (k.includes("travel") || k === "ta") return { cls: "ta", label: "TRAVEL AGENT" };
  if (k.includes("direct") || !k) return { cls: "direct", label: "DIRECT" };
  return { cls: "direct", label: (name ?? "DIRECT").toUpperCase() };
}

// ---- arrival-centric state -----------------------------------------------
type ArrivalBadge = { tone?: "ok" | "info" | "gold"; label: string; rowClass: string };
function arrivalBadge(status: string, checkIn: string, checkOut: string, today: string): ArrivalBadge {
  if (status === "cancelled") return { label: "Cancelled", rowClass: "row-cancelled" };
  if (status === "no_show") return { label: "No show", rowClass: "row-cancelled" };
  if (status === "checked_out" || checkOut < today) return { label: "Checked out", rowClass: "" };
  if (checkIn === today) return { tone: "ok", label: "Arriving", rowClass: "row-arriving" };
  if (checkOut === today) return { tone: "gold", label: "Departs", rowClass: "row-departing" };
  if (checkIn < today && checkOut > today) return { tone: "ok", label: "In stay", rowClass: "row-instay" };
  if (checkIn > today) return { tone: "info", label: "Pre-arrival", rowClass: "" };
  return { label: status.replace(/_/g, " "), rowClass: "" };
}

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

function fmtCheckIn(iso: string, today: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  if (iso === today) return "TODAY";
  return d
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
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

function dateMatches(checkIn: string, value: string, today: string): boolean {
  if (!value || value === "all") return true;
  const ci = new Date(checkIn + "T00:00:00Z").getTime();
  const t = new Date(today + "T00:00:00Z").getTime();
  const day = 86_400_000;
  if (value === "next-30") return ci >= t && ci <= t + 30 * day;
  if (value === "last-30") return ci <= t && ci >= t - 30 * day;
  if (value === "this-month") return checkIn.slice(0, 7) === today.slice(0, 7);
  return true;
}

export function BookingsListClient({ rows, initialActive }: BookingsListClientProps) {
  const router = useRouter();
  const [active, setActive] = React.useState<ActiveFilter[]>(initialActive);
  const [search, setSearch] = React.useState("");
  const [sortDir, setSortDir] = React.useState<SortDirection>("desc");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  // Stable "today" for arrival derivation + date filters (same SSR/CSR value).
  const [today] = React.useState(() => new Date().toISOString().slice(0, 10));

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.bookingCode} ${r.villaCode} ${r.guestName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of active) {
        if (!f.values.length) continue;
        if (f.key === "status" && !f.values.includes(r.status)) return false;
        if (f.key === "channel") {
          const ck = (r.channelKey ?? "direct").toLowerCase();
          if (!f.values.some((v) => ck.includes(v))) return false;
        }
        if (f.key === "date" && !dateMatches(r.checkIn, f.values[0], today)) return false;
      }
      return true;
    });
  }, [rows, active, search, today]);

  const sorted = React.useMemo(() => {
    if (sortDir === null) return filtered;
    const out = [...filtered].sort((a, b) => a.bookingCode.localeCompare(b.bookingCode));
    return sortDir === "desc" ? out.reverse() : out;
  }, [filtered, sortDir]);

  const allSelected = sorted.length > 0 && sorted.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

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
    else setSelected(new Set(sorted.map((r) => r.id)));
  }

  const bulkActions: BulkAction[] = [
    { id: "move", label: "Move to project", onRun: () => alert(`Move ${selected.size} → project (proof-of-life)`) },
    { id: "edit", label: "Bulk edit", onRun: () => alert(`Bulk edit ${selected.size} (proof-of-life)`) },
    { id: "export", label: `Export ${selected.size}`, onRun: () => alert(`Export ${selected.size} (proof-of-life)`) },
    { id: "cancel", label: "Cancel bookings", danger: true, onRun: () => setConfirmCancel(true) },
  ];

  const topBar = selected.size > 0 ? (
    <BulkBar selectedCount={selected.size} actions={bulkActions} onClear={() => setSelected(new Set())} />
  ) : (
    <FilterBar
      filters={FILTER_DEFS}
      active={active}
      onChange={setActive}
      onSearchChange={setSearch}
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
              <Link href="/dashboard/villas" className="btn btn-primary btn-sm">Add a villa</Link>
              <Link href="/dashboard/channels" className="btn btn-secondary btn-sm">Connect channels →</Link>
            </>
          }
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="No bookings match"
          body="Try clearing a filter or widening the date range."
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
              <SortableHeader column="bookingCode" direction={sortDir} onToggle={setSortDir}>
                Code
              </SortableHeader>
              <th>Villa</th>
              <th>Guest</th>
              <th>Channel</th>
              <th>Check-in</th>
              <th className="num">N</th>
              <th className="num">Gross</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const badge = arrivalBadge(b.status, b.checkIn, b.checkOut, today);
              const pill = channelPill(b.channelKey, b.channelName);
              const isSelected = selected.has(b.id);
              return (
                <tr
                  key={b.id}
                  className={
                    [badge.rowClass, isSelected && "row-selected", "cursor-pointer"]
                      .filter(Boolean)
                      .join(" ")
                  }
                  onClick={() => router.push(`/dashboard/bookings/${b.id}`)}
                  title={`Open ${b.bookingCode}`}
                >
                  <td className="cb" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(b.id)}
                      aria-label={`Select ${b.bookingCode}`}
                    />
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    <Link
                      href={`/dashboard/bookings/${b.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {b.bookingCode}
                    </Link>
                  </td>
                  <td className="row-title">{b.villaCode}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="avatar avatar-sm">{initials(b.guestName)}</span>
                      <span>{b.guestName ?? "Guest"}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`channel-pill ${pill.cls}`}>
                      <span className="dot" />
                      {pill.label}
                    </span>
                  </td>
                  <td className="mono text-[12px]">{fmtCheckIn(b.checkIn, today)}</td>
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

      {sorted.length > 0 && (
        <PagerNumbered total={sorted.length} page={1} perPage={20} urlKeyPrefix="" />
      )}

      <DestructiveConfirmModal
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel ${selected.size} booking${selected.size === 1 ? "" : "s"}?`}
        body={
          <>
            Refunds will process via the originating channel. This can&apos;t be
            undone — refunds clear within 14 days.
          </>
        }
        confirmLabel="Yes, cancel & refund"
        cancelLabel="Keep bookings"
        onConfirm={() => setSelected(new Set())}
      />
    </ListPage>
  );
}
