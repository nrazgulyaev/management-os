import "server-only";

import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { crmSavedViews } from "@/lib/db/schema/crm-saved-views";
import { getCurrentUserContext } from "@/features/auth/permissions";
import {
  coerceColumns,
  coerceConditions,
  type FilterCondition,
} from "./filter-types";
import type { CrmSavedViewEntity } from "@/lib/db/schema/crm-saved-views";

/**
 * CRM-SAVED-VIEWS-BULK (#169) — saved-view reads.
 *
 * Org + user scoped: a user sees their own private views plus any view
 * shared across their organization. getDb() may be null (demo) → returns []
 * so the bar renders with the synthetic "All owners" default view only.
 */

export interface SavedViewListItem {
  id: string;
  entity: CrmSavedViewEntity;
  name: string;
  conditions: FilterCondition[];
  columns: string[] | null;
  isShared: boolean;
  isDefault: boolean;
  /** True when the current user owns this view (can edit / delete it). */
  isMine: boolean;
}

/**
 * List saved views for one CRM entity, visible to the current user:
 * their private views OR org-shared views in the same organization.
 */
export async function listSavedViews(
  entity: CrmSavedViewEntity,
): Promise<SavedViewListItem[]> {
  const db = getDb();
  if (!db) return [];

  const ctx = await getCurrentUserContext();
  const myUserId = ctx.appUser?.id ?? null;
  const myOrgId = ctx.appUser?.organizationId ?? null;

  // Visibility: mine (by app_user_id) OR shared within my org. When the
  // session is anonymous (no user/org), fall back to org-shared views only.
  const visibility = [];
  if (myUserId) visibility.push(eq(crmSavedViews.appUserId, myUserId));
  if (myOrgId) {
    visibility.push(
      and(
        eq(crmSavedViews.isShared, true),
        eq(crmSavedViews.organizationId, myOrgId),
      ),
    );
  } else {
    visibility.push(eq(crmSavedViews.isShared, true));
  }

  const rows = await db
    .select()
    .from(crmSavedViews)
    .where(and(eq(crmSavedViews.entity, entity), or(...visibility)))
    .orderBy(desc(crmSavedViews.isDefault), desc(crmSavedViews.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    entity: r.entity as CrmSavedViewEntity,
    name: r.name,
    conditions: coerceConditions(r.filterJson),
    columns: coerceColumns(r.columnsJson),
    isShared: r.isShared,
    isDefault: r.isDefault,
    isMine: myUserId != null && r.appUserId === myUserId,
  }));
}
