/**
 * Pure checklist completion + readiness rules. No DB / no auth — easy to test
 * and re-use from both the field UI optimistic path and the server actions.
 */

export interface ChecklistItemSnapshot {
  status: "pending" | "done" | "failed" | "skipped" | "not_applicable";
  isRequired: boolean;
  photoRequired: boolean;
  hasAttachment?: boolean;
}

export interface ChecklistReadiness {
  canComplete: boolean;
  totalRequired: number;
  doneOrNa: number;
  blockers: string[];
}

/**
 * A required item is "satisfied" when its status is one of the terminal
 * states the spec accepts: done, failed, skipped, not_applicable. The DB
 * captures a free-text reason on skipped/failed via `notes`.
 *
 * If an item is `done` AND requires a photo, an attachment must already
 * exist — otherwise `done` lies about the workflow.
 */
export function isItemSatisfied(item: ChecklistItemSnapshot): boolean {
  if (!item.isRequired) return true;
  if (item.status === "pending") return false;
  if (item.status === "done" && item.photoRequired && !item.hasAttachment) return false;
  return true;
}

export function evaluateChecklistReadiness(
  items: ChecklistItemSnapshot[],
): ChecklistReadiness {
  const blockers: string[] = [];
  let totalRequired = 0;
  let doneOrNa = 0;

  for (const item of items) {
    if (!item.isRequired) continue;
    totalRequired++;
    if (item.status === "pending") {
      blockers.push("required item still pending");
      continue;
    }
    if (item.status === "done" && item.photoRequired && !item.hasAttachment) {
      blockers.push("photo required but no attachment");
      continue;
    }
    doneOrNa++;
  }

  return {
    canComplete: blockers.length === 0,
    totalRequired,
    doneOrNa,
    blockers,
  };
}

/**
 * Mirror of the DB-level `checklist_template_items.item_type` → photo_required
 * mapping. Kept here so callers building a checklist instance from a template
 * don't have to know the convention.
 */
export function templateItemRequiresPhoto(itemType: string): boolean {
  return itemType === "photo_required";
}
