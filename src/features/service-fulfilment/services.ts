import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  guestServiceFulfilments,
  guestServiceRatings,
  serviceFulfilmentEvents,
  serviceFulfilmentFinanceLinks,
  serviceVendorInvoices,
  serviceVendorServices,
  serviceVendorTokens,
  serviceVendors,
  type GuestServiceFulfilment,
  type GuestServiceRating,
  type ServiceFulfilmentEvent,
  type ServiceVendor,
  type ServiceVendorInvoice,
  type ServiceVendorService,
  type ServiceVendorToken,
} from "@/lib/db/schema/service-fulfilment";
import {
  guestServiceOrders,
  guestServices,
  guestServiceOptions,
  type GuestServiceOrder,
  type GuestService,
} from "@/lib/db/schema/guest-services";
import {
  villas,
  type Villa,
} from "@/lib/db/schema/projects";
import { hashVendorToken } from "./vendor-token";

/**
 * Read-only services for the service-fulfilment domain.
 * Mutations live in `actions.ts` (server actions) and `finance-bridge.ts`.
 */

export async function listServiceVendors(opts?: {
  status?: "active" | "paused" | "archived";
  vendorType?: string;
  limit?: number;
}): Promise<ServiceVendor[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters = [
    eq(serviceVendors.organizationId, organizationId),
  ] as ReturnType<typeof eq>[];
  if (opts?.status) filters.push(eq(serviceVendors.status, opts.status));
  if (opts?.vendorType)
    filters.push(eq(serviceVendors.vendorType, opts.vendorType));
  return db
    .select()
    .from(serviceVendors)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(serviceVendors.displayName)
    .limit(opts?.limit ?? 200);
}

export async function getServiceVendorById(
  id: string,
): Promise<ServiceVendor | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(serviceVendors)
    .where(
      and(
        eq(serviceVendors.id, id),
        eq(serviceVendors.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface VendorServiceRow {
  link: ServiceVendorService;
  service: GuestService | null;
}

export async function listVendorServices(
  vendorId: string,
): Promise<VendorServiceRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select({ link: serviceVendorServices, service: guestServices })
    .from(serviceVendorServices)
    .leftJoin(
      guestServices,
      eq(guestServices.id, serviceVendorServices.serviceId),
    )
    .where(
      and(
        eq(serviceVendorServices.vendorId, vendorId),
        eq(serviceVendorServices.organizationId, organizationId),
      ),
    )
    .orderBy(guestServices.name);
  return rows.map((r) => ({ link: r.link, service: r.service ?? null }));
}

export interface FulfilmentRow {
  fulfilment: GuestServiceFulfilment;
  order: GuestServiceOrder | null;
  service: GuestService | null;
  vendor: ServiceVendor | null;
  villa: Villa | null;
}

export async function listGuestServiceFulfilments(opts?: {
  status?: GuestServiceFulfilment["status"];
  vendorId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<FulfilmentRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters: ReturnType<typeof eq>[] = [
    eq(guestServiceFulfilments.organizationId, organizationId),
  ];
  if (opts?.status)
    filters.push(eq(guestServiceFulfilments.status, opts.status));
  if (opts?.vendorId)
    filters.push(eq(guestServiceFulfilments.vendorId, opts.vendorId));
  const rows = await db
    .select({
      fulfilment: guestServiceFulfilments,
      order: guestServiceOrders,
      service: guestServices,
      vendor: serviceVendors,
      villa: villas,
    })
    .from(guestServiceFulfilments)
    .leftJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .leftJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .leftJoin(
      serviceVendors,
      eq(serviceVendors.id, guestServiceFulfilments.vendorId),
    )
    .leftJoin(villas, eq(villas.id, guestServiceOrders.villaId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(guestServiceFulfilments.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    fulfilment: r.fulfilment,
    order: r.order ?? null,
    service: r.service ?? null,
    vendor: r.vendor ?? null,
    villa: r.villa ?? null,
  }));
}

export interface FulfilmentDetail extends FulfilmentRow {
  events: ServiceFulfilmentEvent[];
  invoices: ServiceVendorInvoice[];
  ratings: GuestServiceRating[];
  financeLink: typeof serviceFulfilmentFinanceLinks.$inferSelect | null;
  selectedOptionLabel: string | null;
}

export async function getGuestServiceFulfilmentById(
  id: string,
  organizationId: string | null = null,
): Promise<FulfilmentDetail | null> {
  const db = getDb();
  if (!db) return null;
  const [base] = await db
    .select({
      fulfilment: guestServiceFulfilments,
      order: guestServiceOrders,
      service: guestServices,
      vendor: serviceVendors,
      villa: villas,
    })
    .from(guestServiceFulfilments)
    .leftJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .leftJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .leftJoin(
      serviceVendors,
      eq(serviceVendors.id, guestServiceFulfilments.vendorId),
    )
    .leftJoin(villas, eq(villas.id, guestServiceOrders.villaId))
    .where(
      and(
        eq(guestServiceFulfilments.id, id),
        organizationId
          ? eq(guestServiceFulfilments.organizationId, organizationId)
          : undefined,
      ),
    )
    .limit(1);
  if (!base) return null;
  const [events, invoices, ratings, financeLinkRow, optionLabel] =
    await Promise.all([
      db
        .select()
        .from(serviceFulfilmentEvents)
        .where(eq(serviceFulfilmentEvents.fulfilmentId, id))
        .orderBy(desc(serviceFulfilmentEvents.createdAt))
        .limit(200),
      db
        .select()
        .from(serviceVendorInvoices)
        .where(eq(serviceVendorInvoices.fulfilmentId, id)),
      db
        .select()
        .from(guestServiceRatings)
        .where(eq(guestServiceRatings.fulfilmentId, id)),
      db
        .select()
        .from(serviceFulfilmentFinanceLinks)
        .where(eq(serviceFulfilmentFinanceLinks.fulfilmentId, id))
        .limit(1),
      base.order?.selectedOptionId
        ? db
            .select({ label: guestServiceOptions.label })
            .from(guestServiceOptions)
            .where(eq(guestServiceOptions.id, base.order.selectedOptionId))
            .limit(1)
        : Promise.resolve([] as { label: string }[]),
    ]);
  return {
    fulfilment: base.fulfilment,
    order: base.order ?? null,
    service: base.service ?? null,
    vendor: base.vendor ?? null,
    villa: base.villa ?? null,
    events,
    invoices,
    ratings,
    financeLink: financeLinkRow[0] ?? null,
    selectedOptionLabel: optionLabel[0]?.label ?? null,
  };
}

export async function getFulfilmentForGuestOrder(
  orderId: string,
): Promise<GuestServiceFulfilment | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(guestServiceFulfilments)
    .where(
      and(
        eq(guestServiceFulfilments.orderId, orderId),
        eq(guestServiceFulfilments.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listFulfilmentEvents(
  fulfilmentId: string,
  limit = 200,
): Promise<ServiceFulfilmentEvent[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(serviceFulfilmentEvents)
    .where(eq(serviceFulfilmentEvents.fulfilmentId, fulfilmentId))
    .orderBy(desc(serviceFulfilmentEvents.createdAt))
    .limit(limit);
}

export interface VendorInvoiceRow {
  invoice: ServiceVendorInvoice;
  vendor: ServiceVendor | null;
  fulfilment: GuestServiceFulfilment | null;
}

export async function listVendorInvoices(opts?: {
  status?: ServiceVendorInvoice["invoiceStatus"];
  vendorId?: string;
  limit?: number;
}): Promise<VendorInvoiceRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters: ReturnType<typeof eq>[] = [
    eq(serviceVendorInvoices.organizationId, organizationId),
  ];
  if (opts?.status)
    filters.push(eq(serviceVendorInvoices.invoiceStatus, opts.status));
  if (opts?.vendorId)
    filters.push(eq(serviceVendorInvoices.vendorId, opts.vendorId));
  const rows = await db
    .select({
      invoice: serviceVendorInvoices,
      vendor: serviceVendors,
      fulfilment: guestServiceFulfilments,
    })
    .from(serviceVendorInvoices)
    .leftJoin(
      serviceVendors,
      eq(serviceVendors.id, serviceVendorInvoices.vendorId),
    )
    .leftJoin(
      guestServiceFulfilments,
      eq(guestServiceFulfilments.id, serviceVendorInvoices.fulfilmentId),
    )
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(serviceVendorInvoices.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    invoice: r.invoice,
    vendor: r.vendor ?? null,
    fulfilment: r.fulfilment ?? null,
  }));
}

export async function listGuestServiceRatings(opts?: {
  vendorId?: string;
  status?: GuestServiceRating["status"];
  limit?: number;
}): Promise<GuestServiceRating[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters: ReturnType<typeof eq>[] = [
    eq(guestServiceRatings.organizationId, organizationId),
  ];
  if (opts?.vendorId)
    filters.push(eq(guestServiceRatings.vendorId, opts.vendorId));
  if (opts?.status)
    filters.push(eq(guestServiceRatings.status, opts.status));
  return db
    .select()
    .from(guestServiceRatings)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(guestServiceRatings.createdAt))
    .limit(opts?.limit ?? 200);
}

export interface VendorTokenContext {
  token: ServiceVendorToken;
  fulfilment: GuestServiceFulfilment;
}

export async function getFulfilmentByVendorToken(
  rawToken: string,
): Promise<VendorTokenContext | null> {
  const db = getDb();
  if (!db) return null;
  const tokenHash = hashVendorToken(rawToken);
  const [token] = await db
    .select()
    .from(serviceVendorTokens)
    .where(
      and(
        eq(serviceVendorTokens.tokenHash, tokenHash),
        eq(serviceVendorTokens.status, "active"),
      ),
    )
    .limit(1);
  if (!token) return null;
  const [fulfilment] = await db
    .select()
    .from(guestServiceFulfilments)
    .where(eq(guestServiceFulfilments.id, token.fulfilmentId))
    .limit(1);
  if (!fulfilment) return null;
  return { token, fulfilment };
}

export async function listFulfilmentsForBooking(
  bookingId: string,
): Promise<FulfilmentRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      fulfilment: guestServiceFulfilments,
      order: guestServiceOrders,
      service: guestServices,
      vendor: serviceVendors,
      villa: villas,
    })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .leftJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .leftJoin(
      serviceVendors,
      eq(serviceVendors.id, guestServiceFulfilments.vendorId),
    )
    .leftJoin(villas, eq(villas.id, guestServiceOrders.villaId))
    .where(eq(guestServiceOrders.bookingId, bookingId))
    .orderBy(desc(guestServiceFulfilments.createdAt));
  return rows.map((r) => ({
    fulfilment: r.fulfilment,
    order: r.order,
    service: r.service ?? null,
    vendor: r.vendor ?? null,
    villa: r.villa ?? null,
  }));
}

export async function listFulfilmentsForStayToken(
  stayTokenId: string,
): Promise<FulfilmentRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      fulfilment: guestServiceFulfilments,
      order: guestServiceOrders,
      service: guestServices,
      vendor: serviceVendors,
      villa: villas,
    })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .leftJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .leftJoin(
      serviceVendors,
      eq(serviceVendors.id, guestServiceFulfilments.vendorId),
    )
    .leftJoin(villas, eq(villas.id, guestServiceOrders.villaId))
    .where(eq(guestServiceOrders.guestStayTokenId, stayTokenId))
    .orderBy(desc(guestServiceFulfilments.createdAt));
  return rows.map((r) => ({
    fulfilment: r.fulfilment,
    order: r.order,
    service: r.service ?? null,
    vendor: r.vendor ?? null,
    villa: r.villa ?? null,
  }));
}

export async function listPendingFulfilments(
  limit = 100,
): Promise<FulfilmentRow[]> {
  return listGuestServiceFulfilments({
    status: undefined,
    limit,
  }).then((rows) =>
    rows.filter((r) =>
      ["new", "triage", "awaiting_vendor"].includes(r.fulfilment.status),
    ),
  );
}

export interface FulfilmentMetrics {
  newCount: number;
  triageCount: number;
  awaitingVendorCount: number;
  scheduledTodayCount: number;
  failedCount: number;
  cancelledCount: number;
  unbridgedCompletedCount: number;
  totalMarginMinor: bigint;
  marginCurrency: string | null;
}

export async function getFulfilmentMetrics(
  now: Date = new Date(),
): Promise<FulfilmentMetrics> {
  const db = getDb();
  if (!db) {
    return {
      newCount: 0,
      triageCount: 0,
      awaitingVendorCount: 0,
      scheduledTodayCount: 0,
      failedCount: 0,
      cancelledCount: 0,
      unbridgedCompletedCount: 0,
      totalMarginMinor: 0n,
      marginCurrency: null,
    };
  }
  const organizationId = await requireOrgId();
  const todayIso = now.toISOString().slice(0, 10);
  const startOfDay = new Date(`${todayIso}T00:00:00.000Z`);
  const endOfDay = new Date(`${todayIso}T23:59:59.999Z`);

  const statusCounts = await db
    .select({
      status: guestServiceFulfilments.status,
      count: sql<number>`count(*)::int`,
    })
    .from(guestServiceFulfilments)
    .where(eq(guestServiceFulfilments.organizationId, organizationId))
    .groupBy(guestServiceFulfilments.status);

  const [{ count: scheduledTodayCount = 0 } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(guestServiceFulfilments)
    .where(
      and(
        eq(guestServiceFulfilments.organizationId, organizationId),
        eq(guestServiceFulfilments.status, "scheduled"),
        sql`${guestServiceFulfilments.scheduledFor} >= ${startOfDay.toISOString()}`,
        sql`${guestServiceFulfilments.scheduledFor} <= ${endOfDay.toISOString()}`,
      ),
    );

  const [{ count: unbridgedCount = 0 } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(guestServiceFulfilments)
    .leftJoin(
      serviceFulfilmentFinanceLinks,
      eq(
        serviceFulfilmentFinanceLinks.fulfilmentId,
        guestServiceFulfilments.id,
      ),
    )
    .where(
      and(
        eq(guestServiceFulfilments.organizationId, organizationId),
        eq(guestServiceFulfilments.status, "completed"),
        isNull(serviceFulfilmentFinanceLinks.id),
      ),
    );

  const marginRows = await db
    .select({
      marginMinor: guestServiceFulfilments.marginMinor,
      currency: guestServiceFulfilments.currency,
    })
    .from(guestServiceFulfilments)
    .where(
      and(
        eq(guestServiceFulfilments.status, "completed"),
        eq(guestServiceFulfilments.organizationId, organizationId),
      ),
    );
  let totalMargin = 0n;
  let marginCurrency: string | null = null;
  for (const r of marginRows) {
    if (r.marginMinor != null) {
      totalMargin += r.marginMinor;
      marginCurrency ??= r.currency;
    }
  }

  const byStatus = (k: string) =>
    statusCounts.find((c) => c.status === k)?.count ?? 0;

  return {
    newCount: byStatus("new"),
    triageCount: byStatus("triage"),
    awaitingVendorCount: byStatus("awaiting_vendor"),
    scheduledTodayCount,
    failedCount: byStatus("failed"),
    cancelledCount: byStatus("cancelled"),
    unbridgedCompletedCount: unbridgedCount,
    totalMarginMinor: totalMargin,
    marginCurrency,
  };
}

/** Reserved for forthcoming filters. */
export const __reserved = { inArray };
