/**
 * Pure status-vocabulary bridge between the milestone editor UI and the
 * `milestones` table. The editor speaks `planned | in_progress | done |
 * blocked | slipping`; the table stores `planned | in_progress | done |
 * at_risk | slipped`. Keep these two maps mutually inverse so a round-trip
 * is lossless. No "use server" / "server-only" — shared by both.
 */

import type { MilestoneStatus as DbMilestoneStatus } from "@/lib/db/schema/milestones";

export const UI_MILESTONE_STATUSES = [
  "planned",
  "in_progress",
  "done",
  "blocked",
  "slipping",
] as const;

export type UiMilestoneStatus = (typeof UI_MILESTONE_STATUSES)[number];

export const UI_TO_DB_STATUS: Record<UiMilestoneStatus, DbMilestoneStatus> = {
  planned: "planned",
  in_progress: "in_progress",
  done: "done",
  blocked: "at_risk",
  slipping: "slipped",
};

const DB_TO_UI_STATUS: Record<DbMilestoneStatus, UiMilestoneStatus> = {
  planned: "planned",
  in_progress: "in_progress",
  done: "done",
  at_risk: "blocked",
  slipped: "slipping",
};

export function dbStatusToUi(status: string): UiMilestoneStatus {
  return DB_TO_UI_STATUS[status as DbMilestoneStatus] ?? "planned";
}
