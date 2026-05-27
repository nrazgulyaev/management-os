"use client";

import * as React from "react";
import Link from "next/link";
import { computeSlaStatus, type TicketPriority } from "@/features/maintenance/sla";
import { SlaPill } from "./sla-pill";
import { PriorityBadge } from "./priority-badge";
import { StaffChip } from "./staff-chip";

/**
 * Phase 2.2 mgmt-04 — MaintenanceQueue.
 *
 * Grid-row layout per ticket. Sorted SLA-risk-first (breached →
 * at-risk → on-track). Click a row → navigates to the ticket
 * detail. Click the staff chip → opens AssignStaffModal (caller-
 * provided).
 */

export interface MaintenanceTicket {
  id: string;
  href: string;
  ref: string;
  title: string;
  villaCode: string;
  priority: TicketPriority;
  openedAt: string;
  resolvedAt?: string | null;
  assignee?: { id: string; name: string } | null;
}

export interface MaintenanceQueueProps {
  tickets: MaintenanceTicket[];
  onAssign?: (ticket: MaintenanceTicket) => void;
  /** Override "now" for testing. */
  now?: Date;
  className?: string;
}

const STATUS_RANK = { breached: 0, "at-risk": 1, "on-track": 2 } as const;

function fmtAge(ms: number): string {
  const abs = Math.abs(ms);
  const minutes = Math.round(abs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function MaintenanceQueue({ tickets, onAssign, now, className }: MaintenanceQueueProps) {
  const enriched = tickets
    .map((t) => ({ t, sla: computeSlaStatus({ priority: t.priority, openedAt: t.openedAt, resolvedAt: t.resolvedAt, now }) }))
    .sort((a, b) => STATUS_RANK[a.sla.status] - STATUS_RANK[b.sla.status] || a.t.priority.localeCompare(b.t.priority));

  return (
    <div className={`maintenance-queue${className ? ` ${className}` : ""}`}>
      {enriched.map(({ t, sla }) => {
        const hint =
          sla.status === "breached"
            ? `breached ${fmtAge(-sla.remainingMs)} ago`
            : `${fmtAge(sla.remainingMs)} left`;
        return (
          <div className={`mq-row status-${sla.status}`} key={t.id}>
            <PriorityBadge priority={t.priority} compact />
            <Link href={t.href} className="mq-title">
              <span className="ref mono">{t.ref}</span>
              <span className="title">{t.title}</span>
              <span className="villa mono">{t.villaCode}</span>
            </Link>
            <SlaPill status={sla.status} hint={hint} />
            <StaffChip
              staff={t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null}
              onClick={onAssign ? () => onAssign(t) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
