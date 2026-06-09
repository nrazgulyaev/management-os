/**
 * CRM tasks — shared types + pure helpers (NO "use server"; safe to import
 * from server actions, services, and client components alike).
 */

import {
  CRM_TASK_SUBJECT_TYPES,
  CRM_TASK_PRIORITIES,
  type CrmTaskSubjectType,
  type CrmTaskStatus,
  type CrmTaskPriority,
} from "@/lib/db/schema/crm-tasks";

export type {
  CrmTaskSubjectType,
  CrmTaskStatus,
  CrmTaskPriority,
} from "@/lib/db/schema/crm-tasks";
export {
  CRM_TASK_SUBJECT_TYPES,
  CRM_TASK_STATUSES,
  CRM_TASK_PRIORITIES,
} from "@/lib/db/schema/crm-tasks";

/** A task row enriched with the assignee's display name for the UI. */
export interface CrmTaskView {
  id: string;
  subjectType: CrmTaskSubjectType;
  subjectId: string;
  title: string;
  body: string | null;
  dueAt: string | null;
  priority: CrmTaskPriority;
  status: CrmTaskStatus;
  assigneeUserId: string | null;
  assigneeName: string | null;
  completedAt: string | null;
  createdByName: string | null;
  createdAt: string;
  /** Derived: open task whose due_at is in the past. */
  overdue: boolean;
  /** Derived: open task due before end of today (local-naive UTC compare). */
  dueToday: boolean;
}

const SUBJECT_LABELS: Record<CrmTaskSubjectType, string> = {
  owner: "Owner",
  contact: "Contact",
  lead: "Lead",
  buyer: "Buyer",
  deal: "Deal",
};

export function subjectTypeLabel(t: CrmTaskSubjectType): string {
  return SUBJECT_LABELS[t] ?? t;
}

/**
 * Deep-link to the CRM record a task hangs off, when a detail route exists.
 * Returns null for subject types that have no detail page yet (loose
 * coupling — the "My tasks" view just shows the subject label then).
 */
export function subjectHref(
  subjectType: CrmTaskSubjectType,
  subjectId: string,
): string | null {
  switch (subjectType) {
    case "owner":
      return `/dashboard/owners/${subjectId}`;
    default:
      return null;
  }
}

export function isCrmSubjectType(v: unknown): v is CrmTaskSubjectType {
  return (
    typeof v === "string" &&
    (CRM_TASK_SUBJECT_TYPES as readonly string[]).includes(v)
  );
}

export function isCrmPriority(v: unknown): v is CrmTaskPriority {
  return (
    typeof v === "string" &&
    (CRM_TASK_PRIORITIES as readonly string[]).includes(v)
  );
}

/** End-of-today boundary in UTC for the due-today / due-feed views. */
export function endOfTodayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}
