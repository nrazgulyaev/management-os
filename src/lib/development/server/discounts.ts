import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema/contacts";
import { villas } from "@/lib/db/schema/projects";
import {
  discountAuthorizations,
  unitDiscounts,
  type DiscountAuthorization,
  type UnitDiscount,
} from "@/lib/db/schema/sales";
import { roles, userRoles } from "@/lib/db/schema/identity";
import type {
  DiscountAuthorizationLimit,
  DiscountReason,
  DiscountStatus,
  DiscountType,
  UnitDiscountListItem,
} from "@/lib/development/types/discounts";

export type {
  DiscountAuthorizationLimit,
  UnitDiscountListItem,
} from "@/lib/development/types/discounts";

interface JoinedRow {
  discount: UnitDiscount;
  villaCode: string;
  contactFullName: string;
}

function rowToItem(r: JoinedRow): UnitDiscountListItem {
  return {
    id: r.discount.id,
    villaId: r.discount.villaId,
    villaCode: r.villaCode,
    contactId: r.discount.contactId,
    contactFullName: r.contactFullName,
    contractGroupId: r.discount.contractGroupId,
    discountType: r.discount.discountType as DiscountType,
    discountPercent:
      r.discount.discountPercent !== null
        ? Number(r.discount.discountPercent)
        : null,
    discountAmountUsdMinor: r.discount.discountAmountUsdMinor,
    appliedToOriginalPriceUsdMinor: r.discount.appliedToOriginalPriceUsdMinor,
    finalPriceUsdMinor: r.discount.finalPriceUsdMinor,
    reason: r.discount.reason as DiscountReason,
    reasonNote: r.discount.reasonNote,
    proposedBy: r.discount.proposedBy,
    proposedAt:
      r.discount.proposedAt instanceof Date
        ? r.discount.proposedAt.toISOString()
        : String(r.discount.proposedAt),
    status: r.discount.status as DiscountStatus,
    escalationRequired: r.discount.escalationRequired,
    escalatedTo: r.discount.escalatedTo,
    escalatedAt: r.discount.escalatedAt
      ? r.discount.escalatedAt.toISOString()
      : null,
    approvedBy: r.discount.approvedBy,
    approvedAt: r.discount.approvedAt
      ? r.discount.approvedAt.toISOString()
      : null,
    rejectedReason: r.discount.rejectedReason,
    appliedAt: r.discount.appliedAt
      ? r.discount.appliedAt.toISOString()
      : null,
  };
}

export interface DiscountFilters {
  status?: DiscountStatus;
  contactId?: string;
}

export async function getDiscounts(
  filters: DiscountFilters = {},
): Promise<UnitDiscountListItem[]> {
  const db = getDb();
  if (!db) return [];
  const conds = [];
  if (filters.status) conds.push(eq(unitDiscounts.status, filters.status));
  if (filters.contactId)
    conds.push(eq(unitDiscounts.contactId, filters.contactId));

  const rows = await db
    .select({
      discount: unitDiscounts,
      villaCode: villas.unitCode,
      contactFullName: contacts.fullName,
    })
    .from(unitDiscounts)
    .innerJoin(villas, eq(villas.id, unitDiscounts.villaId))
    .innerJoin(contacts, eq(contacts.id, unitDiscounts.contactId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(unitDiscounts.proposedAt));
  return rows.map(rowToItem);
}

export async function getPendingDiscountApprovals(): Promise<UnitDiscountListItem[]> {
  return getDiscounts({ status: "pending_approval" });
}

export async function getDiscountById(
  id: string,
): Promise<UnitDiscountListItem | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      discount: unitDiscounts,
      villaCode: villas.unitCode,
      contactFullName: contacts.fullName,
    })
    .from(unitDiscounts)
    .innerJoin(villas, eq(villas.id, unitDiscounts.villaId))
    .innerJoin(contacts, eq(contacts.id, unitDiscounts.contactId))
    .where(eq(unitDiscounts.id, id))
    .limit(1);
  return row ? rowToItem(row) : null;
}

function authToData(r: DiscountAuthorization): DiscountAuthorizationLimit {
  return {
    id: r.id,
    roleKey: r.roleKey,
    maxPercentValue:
      r.maxPercentValue !== null ? Number(r.maxPercentValue) : null,
    maxAbsoluteUsdMinor: r.maxAbsoluteUsdMinor,
    requiresEscalationAbovePercent:
      r.requiresEscalationAbovePercent !== null
        ? Number(r.requiresEscalationAbovePercent)
        : null,
    escalateToRoleKey: r.escalateToRoleKey,
    notes: r.notes,
    isActive: r.isActive,
  };
}

export async function getAllAuthorizationLimits(): Promise<DiscountAuthorizationLimit[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(discountAuthorizations)
    .orderBy(asc(discountAuthorizations.roleKey));
  return rows.map(authToData);
}

export async function getUserAuthorizationLimits(
  userId: string,
): Promise<DiscountAuthorizationLimit[]> {
  const db = getDb();
  if (!db) return [];
  const userRoleRows = await db
    .select({ roleKey: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  const keys = userRoleRows.map((r) => r.roleKey);
  if (keys.length === 0) return [];
  const auths = await db
    .select()
    .from(discountAuthorizations)
    .where(eq(discountAuthorizations.isActive, true));
  return auths.filter((a) => keys.includes(a.roleKey)).map(authToData);
}

export async function getRoleKeysForUser(userId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ roleKey: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.roleKey);
}
