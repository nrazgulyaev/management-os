import "server-only";

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestServiceCategories,
  guestServiceFinanceLinks,
  guestServiceOptions,
  guestServiceOrderEvents,
  guestServiceOrders,
  guestServices,
  type GuestService,
  type GuestServiceCategory,
  type GuestServiceFinanceLink,
  type GuestServiceOption,
  type GuestServiceOrder,
  type GuestServiceOrderEvent,
} from "@/lib/db/schema/guest-services";
import { villas, projects } from "@/lib/db/schema/projects";
import { bookings, guests } from "@/lib/db/schema/bookings";
import { appUsers } from "@/lib/db/schema/identity";

// -----------------------------------------------------------------------------
// Categories
// -----------------------------------------------------------------------------

export async function listCategories(opts?: {
  includeArchived?: boolean;
}): Promise<GuestServiceCategory[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (!opts?.includeArchived) {
    filters.push(eq(guestServiceCategories.status, "active"));
  }
  return db
    .select()
    .from(guestServiceCategories)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      asc(guestServiceCategories.sortOrder),
      asc(guestServiceCategories.name),
    );
}

export async function getCategoryById(
  id: string,
): Promise<GuestServiceCategory | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select()
    .from(guestServiceCategories)
    .where(eq(guestServiceCategories.id, id))
    .limit(1);
  return r ?? null;
}

// -----------------------------------------------------------------------------
// Catalog (admin)
// -----------------------------------------------------------------------------

export interface CatalogServiceRow extends GuestService {
  categoryName: string | null;
  villaCode: string | null;
  projectName: string | null;
  optionCount: number;
}

export async function listAllCatalogServices(opts?: {
  status?: "active" | "paused" | "archived";
  search?: string;
  projectId?: string;
  villaId?: string;
  categoryId?: string;
  limit?: number;
}): Promise<CatalogServiceRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.status) filters.push(eq(guestServices.status, opts.status));
  if (opts?.projectId)
    filters.push(eq(guestServices.projectId, opts.projectId));
  if (opts?.villaId) filters.push(eq(guestServices.villaId, opts.villaId));
  if (opts?.categoryId)
    filters.push(eq(guestServices.categoryId, opts.categoryId));
  if (opts?.search) {
    const pat = `%${opts.search.toLowerCase()}%`;
    filters.push(sql`lower(${guestServices.name}) like ${pat}`);
  }

  const optionCounts = db.$with("option_counts").as(
    db
      .select({
        serviceId: guestServiceOptions.serviceId,
        c: sql<number>`count(*)`.as("c"),
      })
      .from(guestServiceOptions)
      .where(eq(guestServiceOptions.status, "active"))
      .groupBy(guestServiceOptions.serviceId),
  );

  const rows = await db
    .with(optionCounts)
    .select({
      s: guestServices,
      categoryName: guestServiceCategories.name,
      villaCode: villas.unitCode,
      projectName: projects.name,
      optionCount: sql<number>`coalesce(${optionCounts.c}, 0)`.as(
        "option_count",
      ),
    })
    .from(guestServices)
    .leftJoin(
      guestServiceCategories,
      eq(guestServiceCategories.id, guestServices.categoryId),
    )
    .leftJoin(villas, eq(villas.id, guestServices.villaId))
    .leftJoin(projects, eq(projects.id, guestServices.projectId))
    .leftJoin(optionCounts, eq(optionCounts.serviceId, guestServices.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      asc(guestServices.sortOrder),
      asc(guestServices.name),
    )
    .limit(opts?.limit ?? 500);

  return rows.map((r) => ({
    ...r.s,
    categoryName: r.categoryName ?? null,
    villaCode: r.villaCode ?? null,
    projectName: r.projectName ?? null,
    optionCount: Number(r.optionCount ?? 0),
  }));
}

export async function getServiceById(
  id: string,
): Promise<
  | (GuestService & {
      categoryName: string | null;
      villaCode: string | null;
      projectName: string | null;
      options: GuestServiceOption[];
    })
  | null
> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      s: guestServices,
      categoryName: guestServiceCategories.name,
      villaCode: villas.unitCode,
      projectName: projects.name,
    })
    .from(guestServices)
    .leftJoin(
      guestServiceCategories,
      eq(guestServiceCategories.id, guestServices.categoryId),
    )
    .leftJoin(villas, eq(villas.id, guestServices.villaId))
    .leftJoin(projects, eq(projects.id, guestServices.projectId))
    .where(eq(guestServices.id, id))
    .limit(1);
  if (!row) return null;
  const options = await db
    .select()
    .from(guestServiceOptions)
    .where(eq(guestServiceOptions.serviceId, id))
    .orderBy(
      asc(guestServiceOptions.sortOrder),
      asc(guestServiceOptions.label),
    );
  return {
    ...row.s,
    categoryName: row.categoryName ?? null,
    villaCode: row.villaCode ?? null,
    projectName: row.projectName ?? null,
    options,
  };
}

// -----------------------------------------------------------------------------
// Catalog (guest portal) — villa-first → project-fallback → global
// -----------------------------------------------------------------------------

export interface GuestVisibleService {
  id: string;
  serviceKey: string;
  name: string;
  shortDescription: string | null;
  descriptionMd: string | null;
  imageUrl: string | null;
  serviceType: string;
  pricingModel: string;
  basePriceMinor: bigint;
  currency: string;
  requiresDate: boolean;
  requiresTime: boolean;
  requiresGuestCount: boolean;
  requiresAdminConfirmation: boolean;
  allowMultipleDays: boolean;
  minQuantity: number;
  maxQuantity: number | null;
  leadTimeHours: number | null;
  cancellationPolicyMd: string | null;
  status: string;
  sortOrder: number;
  category: { id: string; key: string; name: string; icon: string | null } | null;
  options: Array<{
    id: string;
    optionKey: string;
    label: string;
    description: string | null;
    priceDeltaMinor: bigint;
    isDefault: boolean;
    sortOrder: number;
  }>;
}

/**
 * Resolve services visible to a specific guest stay. Resolution rule:
 * any villa-scoped row REPLACES the project- and global-scoped fallback
 * for that `service_key`. Service rows scoped to other villas/projects
 * are excluded.
 */
export async function listGuestVisibleServices(input: {
  villaId: string;
  projectId: string | null;
}): Promise<GuestVisibleService[]> {
  const db = getDb();
  if (!db) return [];

  // Pull the candidate set: villa-scoped, project-scoped, OR global.
  const scopeFilter = or(
    eq(guestServices.villaId, input.villaId),
    input.projectId
      ? eq(guestServices.projectId, input.projectId)
      : sql`false`,
    and(
      isNull(guestServices.villaId),
      isNull(guestServices.projectId),
    ),
  );

  const rows = await db
    .select({
      s: guestServices,
      category: guestServiceCategories,
    })
    .from(guestServices)
    .leftJoin(
      guestServiceCategories,
      eq(guestServiceCategories.id, guestServices.categoryId),
    )
    .where(
      and(
        eq(guestServices.status, "active"),
        eq(guestServices.guestVisible, true),
        scopeFilter,
      ),
    )
    .orderBy(
      asc(guestServices.sortOrder),
      asc(guestServices.name),
    );

  if (rows.length === 0) return [];

  // Apply villa-first fallback by service_key. We pick the most specific
  // scope per key.
  const scoreFor = (r: (typeof rows)[number]): number => {
    if (r.s.villaId === input.villaId) return 3;
    if (input.projectId && r.s.projectId === input.projectId) return 2;
    return 1; // global
  };
  const bestByKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = bestByKey.get(r.s.serviceKey);
    if (!cur || scoreFor(r) > scoreFor(cur)) {
      bestByKey.set(r.s.serviceKey, r);
    }
  }

  const winners = Array.from(bestByKey.values()).sort((a, b) => {
    const so = (a.s.sortOrder ?? 0) - (b.s.sortOrder ?? 0);
    if (so !== 0) return so;
    return a.s.name.localeCompare(b.s.name);
  });

  const serviceIds = winners.map((w) => w.s.id);
  const allOptions = await db
    .select()
    .from(guestServiceOptions)
    .where(
      and(
        inArray(guestServiceOptions.serviceId, serviceIds),
        eq(guestServiceOptions.status, "active"),
      ),
    )
    .orderBy(
      asc(guestServiceOptions.sortOrder),
      asc(guestServiceOptions.label),
    );

  const optionsByService = new Map<string, GuestServiceOption[]>();
  for (const opt of allOptions) {
    const list = optionsByService.get(opt.serviceId) ?? [];
    list.push(opt);
    optionsByService.set(opt.serviceId, list);
  }

  return winners.map(({ s, category }) => ({
    id: s.id,
    serviceKey: s.serviceKey,
    name: s.name,
    shortDescription: s.shortDescription,
    descriptionMd: s.descriptionMd,
    imageUrl: s.imageUrl,
    serviceType: s.serviceType,
    pricingModel: s.pricingModel,
    basePriceMinor: s.basePriceMinor,
    currency: s.currency,
    requiresDate: s.requiresDate,
    requiresTime: s.requiresTime,
    requiresGuestCount: s.requiresGuestCount,
    requiresAdminConfirmation: s.requiresAdminConfirmation,
    allowMultipleDays: s.allowMultipleDays,
    minQuantity: s.minQuantity,
    maxQuantity: s.maxQuantity,
    leadTimeHours: s.leadTimeHours,
    cancellationPolicyMd: s.cancellationPolicyMd,
    status: s.status,
    sortOrder: s.sortOrder,
    category: category
      ? {
          id: category.id,
          key: category.key,
          name: category.name,
          icon: category.icon,
        }
      : null,
    options: (optionsByService.get(s.id) ?? []).map((o) => ({
      id: o.id,
      optionKey: o.optionKey,
      label: o.label,
      description: o.description,
      priceDeltaMinor: o.priceDeltaMinor,
      isDefault: o.isDefault,
      sortOrder: o.sortOrder,
    })),
  }));
}

// -----------------------------------------------------------------------------
// Orders (admin lists + detail + booking history)
// -----------------------------------------------------------------------------

export interface OrderListRow extends GuestServiceOrder {
  serviceName: string | null;
  serviceType: string | null;
  villaCode: string | null;
  bookingCode: string | null;
  guestDisplay: string | null;
}

export async function listGuestServiceOrders(opts?: {
  status?: string | string[];
  bookingId?: string;
  villaId?: string;
  limit?: number;
}): Promise<OrderListRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.status) {
    if (Array.isArray(opts.status)) {
      filters.push(inArray(guestServiceOrders.status, opts.status));
    } else {
      filters.push(eq(guestServiceOrders.status, opts.status));
    }
  }
  if (opts?.bookingId)
    filters.push(eq(guestServiceOrders.bookingId, opts.bookingId));
  if (opts?.villaId)
    filters.push(eq(guestServiceOrders.villaId, opts.villaId));

  const rows = await db
    .select({
      o: guestServiceOrders,
      serviceName: guestServices.name,
      serviceType: guestServices.serviceType,
      villaCode: villas.unitCode,
      bookingCode: bookings.bookingCode,
      guestName: guests.fullName,
    })
    .from(guestServiceOrders)
    .leftJoin(guestServices, eq(guestServices.id, guestServiceOrders.serviceId))
    .leftJoin(villas, eq(villas.id, guestServiceOrders.villaId))
    .leftJoin(bookings, eq(bookings.id, guestServiceOrders.bookingId))
    .leftJoin(guests, eq(guests.id, guestServiceOrders.guestId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(guestServiceOrders.createdAt))
    .limit(opts?.limit ?? 200);

  return rows.map((r) => ({
    ...r.o,
    serviceName: r.serviceName ?? null,
    serviceType: r.serviceType ?? null,
    villaCode: r.villaCode ?? null,
    bookingCode: r.bookingCode ?? null,
    guestDisplay: r.guestName
      ? abbreviateGuestName(r.guestName)
      : null,
  }));
}

function abbreviateGuestName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export interface OrderDetail {
  order: GuestServiceOrder;
  service: GuestService | null;
  selectedOption: GuestServiceOption | null;
  category: GuestServiceCategory | null;
  villaCode: string | null;
  bookingCode: string | null;
  bookingId: string | null;
  guestDisplay: string | null;
  assignedToName: string | null;
  events: Array<
    GuestServiceOrderEvent & { actorName: string | null }
  >;
  financeLink: GuestServiceFinanceLink | null;
}

export async function getOrderById(id: string): Promise<OrderDetail | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      o: guestServiceOrders,
      s: guestServices,
      opt: guestServiceOptions,
      cat: guestServiceCategories,
      villaCode: villas.unitCode,
      bookingCode: bookings.bookingCode,
      guestName: guests.fullName,
      assignedToName: appUsers.fullName,
    })
    .from(guestServiceOrders)
    .leftJoin(guestServices, eq(guestServices.id, guestServiceOrders.serviceId))
    .leftJoin(
      guestServiceOptions,
      eq(guestServiceOptions.id, guestServiceOrders.selectedOptionId),
    )
    .leftJoin(
      guestServiceCategories,
      eq(guestServiceCategories.id, guestServices.categoryId),
    )
    .leftJoin(villas, eq(villas.id, guestServiceOrders.villaId))
    .leftJoin(bookings, eq(bookings.id, guestServiceOrders.bookingId))
    .leftJoin(guests, eq(guests.id, guestServiceOrders.guestId))
    .leftJoin(appUsers, eq(appUsers.id, guestServiceOrders.assignedTo))
    .where(eq(guestServiceOrders.id, id))
    .limit(1);
  if (!row) return null;

  const events = await db
    .select({
      e: guestServiceOrderEvents,
      actorName: appUsers.fullName,
    })
    .from(guestServiceOrderEvents)
    .leftJoin(
      appUsers,
      eq(appUsers.id, guestServiceOrderEvents.actorAppUserId),
    )
    .where(eq(guestServiceOrderEvents.orderId, id))
    .orderBy(desc(guestServiceOrderEvents.createdAt))
    .limit(200);

  const [link] = await db
    .select()
    .from(guestServiceFinanceLinks)
    .where(eq(guestServiceFinanceLinks.orderId, id))
    .limit(1);

  return {
    order: row.o,
    service: row.s ?? null,
    selectedOption: row.opt ?? null,
    category: row.cat ?? null,
    villaCode: row.villaCode ?? null,
    bookingCode: row.bookingCode ?? null,
    bookingId: row.o.bookingId ?? null,
    guestDisplay: row.guestName ? abbreviateGuestName(row.guestName) : null,
    assignedToName: row.assignedToName ?? null,
    events: events.map((e) => ({
      ...e.e,
      actorName: e.actorName ?? null,
    })),
    financeLink: link ?? null,
  };
}

export async function listOrdersForBooking(
  bookingId: string,
): Promise<OrderListRow[]> {
  return listGuestServiceOrders({ bookingId, limit: 100 });
}

// -----------------------------------------------------------------------------
// Counter mint — kept local to avoid changing operations.nextDailyCounter shape.
// -----------------------------------------------------------------------------

export async function nextGuestServiceOrderCounter(
  now: Date = new Date(),
): Promise<number> {
  const db = getDb();
  if (!db) return 1;
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const pattern = `GSO-${y}${m}${d}-%`;
  const [r] = await db
    .select({ count: sql<number>`count(*)` })
    .from(guestServiceOrders)
    .where(sql`${guestServiceOrders.orderCode} like ${pattern}`);
  return Number(r?.count ?? 0) + 1;
}

// -----------------------------------------------------------------------------
// Stats — used by hub + dashboards.
// -----------------------------------------------------------------------------

export interface OrderStats {
  total: number;
  active: number;
  fulfilled: number;
  cancelled: number;
  pendingFinanceBridge: number;
  bridgedRevenueMinor: bigint;
  currency: string | null;
}

export async function getOrderStats(): Promise<OrderStats> {
  const db = getDb();
  if (!db) {
    return {
      total: 0,
      active: 0,
      fulfilled: 0,
      cancelled: 0,
      pendingFinanceBridge: 0,
      bridgedRevenueMinor: 0n,
      currency: null,
    };
  }
  const [agg] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${guestServiceOrders.status} in ('requested','reviewing','confirmed','scheduled'))`,
      fulfilled: sql<number>`count(*) filter (where ${guestServiceOrders.status} = 'fulfilled')`,
      cancelled: sql<number>`count(*) filter (where ${guestServiceOrders.status} in ('cancelled','rejected'))`,
      pendingFinanceBridge: sql<number>`count(*) filter (where ${guestServiceOrders.status} = 'fulfilled' and ${guestServiceOrders.financeBridgeStatus} = 'pending')`,
      bridgedRevenueMinor: sql<string>`coalesce(sum(${guestServiceOrders.guestPriceMinor}) filter (where ${guestServiceOrders.financeBridgeStatus} = 'bridged'), 0)`,
      currency: sql<string | null>`max(${guestServiceOrders.currency})`,
    })
    .from(guestServiceOrders);
  return {
    total: Number(agg?.total ?? 0),
    active: Number(agg?.active ?? 0),
    fulfilled: Number(agg?.fulfilled ?? 0),
    cancelled: Number(agg?.cancelled ?? 0),
    pendingFinanceBridge: Number(agg?.pendingFinanceBridge ?? 0),
    bridgedRevenueMinor: BigInt(agg?.bridgedRevenueMinor ?? "0"),
    currency: agg?.currency ?? null,
  };
}
