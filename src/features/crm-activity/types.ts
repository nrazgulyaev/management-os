/**
 * CRM ACTIVITY TIMELINE (#169) — shared types + sync helpers.
 *
 * Kept in a NON-"use server" module so it can export sync constants, types and
 * pure functions. The "use server" action module (./services.ts) imports from
 * here. (BUILD-SAFETY: a "use server" file may export ONLY async functions.)
 */

/** Polymorphic subject the activity is attached to. */
export type CrmSubjectType = "owner" | "contact" | "lead" | "buyer";

/** The kind of thing that happened. */
export type CrmActivityKind =
  | "note"
  | "message"
  | "status_change"
  | "call"
  | "task"
  | "email";

export const CRM_SUBJECT_TYPES: readonly CrmSubjectType[] = [
  "owner",
  "contact",
  "lead",
  "buyer",
] as const;

export const CRM_ACTIVITY_KINDS: readonly CrmActivityKind[] = [
  "note",
  "message",
  "status_change",
  "call",
  "task",
  "email",
] as const;

export function isCrmSubjectType(v: string): v is CrmSubjectType {
  return (CRM_SUBJECT_TYPES as readonly string[]).includes(v);
}

export function isCrmActivityKind(v: string): v is CrmActivityKind {
  return (CRM_ACTIVITY_KINDS as readonly string[]).includes(v);
}

/** Display-ready activity row returned by the read path. */
export interface CrmActivityView {
  id: string;
  subjectType: CrmSubjectType;
  subjectId: string;
  kind: CrmActivityKind;
  title: string;
  body: string | null;
  actorAppUserId: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  /** ISO timestamp. */
  occurredAt: string;
}

/** Input to record a new activity. */
export interface RecordCrmActivityInput {
  subjectType: CrmSubjectType;
  subjectId: string;
  kind: CrmActivityKind;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Optional explicit occurredAt (defaults to now). */
  occurredAt?: Date;
}
