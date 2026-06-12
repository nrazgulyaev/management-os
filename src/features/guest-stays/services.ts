import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  guestStayTokens,
  type GuestStayToken,
} from "@/lib/db/schema/guest-stays";
import { bookings, guests } from "@/lib/db/schema/bookings";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import {
  listEmergencyContactsForGuest,
  listGuideSectionsForGuest,
  listNeighborhoodForGuest,
  listWifiForGuest,
} from "@/features/villa-guides/services";
import {
  createOrGetStubSmartLockCode,
  presentStubLockToGuest,
} from "./smart-lock-stub";
import { hashStayToken } from "./token";

export interface GuestStayTokenRow {
  id: string;
  bookingId: string;
  bookingCode: string | null;
  villaCode: string | null;
  projectName: string | null;
  status: string;
  tokenPrefix: string;
  issuedToEmail: string | null;
  issuedToPhone: string | null;
  expiresAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
}

function mapToken(
  r: GuestStayToken,
  bookingCode: string | null,
  villaCode: string | null,
  projectName: string | null,
): GuestStayTokenRow {
  return {
    id: r.id,
    bookingId: r.bookingId,
    bookingCode,
    villaCode,
    projectName,
    status: r.status,
    tokenPrefix: r.tokenPrefix,
    issuedToEmail: r.issuedToEmail,
    issuedToPhone: r.issuedToPhone,
    expiresAt: r.expiresAt.toISOString(),
    lastAccessedAt: r.lastAccessedAt?.toISOString() ?? null,
    accessCount: r.accessCount,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    revokeReason: r.revokeReason,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listGuestStayTokens(opts?: {
  status?: string;
  bookingId?: string;
  limit?: number;
}): Promise<GuestStayTokenRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY (mig 0158): guest_stay_tokens.organization_id is NOT NULL. Scope to
  // the caller's org so the mgmt Tokens list never shows another org's / demo
  // stay tokens.
  const filters = [eq(guestStayTokens.organizationId, await requireOrgId())];
  if (opts?.status) filters.push(eq(guestStayTokens.status, opts.status));
  if (opts?.bookingId)
    filters.push(eq(guestStayTokens.bookingId, opts.bookingId));
  const rows = await db
    .select({
      t: guestStayTokens,
      bookingCode: bookings.bookingCode,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(guestStayTokens)
    .leftJoin(bookings, eq(bookings.id, guestStayTokens.bookingId))
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(guestStayTokens.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) =>
    mapToken(
      r.t,
      r.bookingCode ?? null,
      r.villaCode ?? null,
      r.projectName ?? null,
    ),
  );
}

export async function listTokensForBooking(
  bookingId: string,
): Promise<GuestStayTokenRow[]> {
  return listGuestStayTokens({ bookingId, limit: 50 });
}

export async function getGuestStayTokenById(
  id: string,
): Promise<GuestStayTokenRow | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select({
      t: guestStayTokens,
      bookingCode: bookings.bookingCode,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(guestStayTokens)
    .leftJoin(bookings, eq(bookings.id, guestStayTokens.bookingId))
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    // TENANCY: a cross-org token id reads as not-found.
    .where(
      and(
        eq(guestStayTokens.id, id),
        eq(guestStayTokens.organizationId, await requireOrgId()),
      ),
    )
    .limit(1);
  return r
    ? mapToken(
        r.t,
        r.bookingCode ?? null,
        r.villaCode ?? null,
        r.projectName ?? null,
      )
    : null;
}

// -----------------------------------------------------------------------------
// Token resolver — used by /stay/[token] server routes.
// -----------------------------------------------------------------------------

export interface ResolvedStayBase {
  tokenId: string;
  /** Org anchor — guest_stay_tokens.organization_id (NOT NULL since 0158). */
  organizationId: string;
  bookingId: string;
  bookingCode: string;
  villaId: string;
  villaCode: string | null;
  villaName: string | null;
  projectId: string | null;
  projectName: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestsCount: number;
  guestDisplayName: string | null;
  status: string;
}

export type ResolveOutcome =
  | { ok: true; stay: ResolvedStayBase }
  | { ok: false; reason: "invalid" | "expired" | "revoked" | "not_found" };

function safeGuestDisplay(
  fullName: string | null,
  email: string | null,
): string | null {
  if (fullName && fullName.trim().length > 0) {
    const [first, ...rest] = fullName.trim().split(/\s+/);
    const initial = rest.length > 0 ? rest[rest.length - 1][0] : "";
    return initial ? `${first} ${initial}.` : first;
  }
  if (email) {
    const local = email.split("@")[0] ?? "";
    return local.slice(0, 3) + "***";
  }
  return null;
}

/**
 * Resolve a raw token from the URL into a guest-safe stay summary.
 * Hashes the token and looks up the row. Increments access_count +
 * last_accessed_at on success. Never returns the token_hash.
 */
export async function getStayByToken(
  token: string,
  now: Date = new Date(),
): Promise<ResolveOutcome> {
  const db = getDb();
  if (!db) return { ok: false, reason: "not_found" };
  if (!token || token.length < 16) return { ok: false, reason: "invalid" };

  const tokenHash = hashStayToken(token);
  const [row] = await db
    .select({
      t: guestStayTokens,
      booking: bookings,
      villa: villas,
      projectName: projectsTable.name,
      guestName: guests.fullName,
      guestEmail: guests.email,
    })
    .from(guestStayTokens)
    .leftJoin(bookings, eq(bookings.id, guestStayTokens.bookingId))
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(eq(guestStayTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || !row.booking || !row.villa) {
    return { ok: false, reason: "invalid" };
  }
  if (row.t.status === "revoked") {
    return { ok: false, reason: "revoked" };
  }
  if (
    row.t.status === "expired" ||
    row.t.expiresAt.getTime() < now.getTime()
  ) {
    // Auto-flip to expired so admin filters stay accurate.
    if (row.t.status !== "expired") {
      await db
        .update(guestStayTokens)
        .set({ status: "expired" })
        .where(eq(guestStayTokens.id, row.t.id));
    }
    return { ok: false, reason: "expired" };
  }

  // Success — increment access counters.
  await db
    .update(guestStayTokens)
    .set({
      accessCount: row.t.accessCount + 1,
      lastAccessedAt: now,
    })
    .where(eq(guestStayTokens.id, row.t.id));

  const checkIn = row.booking.checkIn as unknown as string;
  const checkOut = row.booking.checkOut as unknown as string;

  return {
    ok: true,
    stay: {
      tokenId: row.t.id,
      organizationId: row.t.organizationId,
      bookingId: row.booking.id,
      bookingCode: row.booking.bookingCode,
      villaId: row.villa.id,
      villaCode: row.villa.unitCode ?? null,
      villaName: row.villa.name ?? null,
      projectId: row.villa.projectId ?? null,
      projectName: row.projectName ?? null,
      checkIn,
      checkOut,
      nights: row.booking.nights,
      guestsCount:
        (row.booking.adults ?? 0) + (row.booking.children ?? 0),
      guestDisplayName: safeGuestDisplay(
        row.guestName ?? null,
        row.guestEmail ?? null,
      ),
      status: row.booking.status,
    },
  };
}

// -----------------------------------------------------------------------------
// Aggregate stay summary — used by every /stay/[token] subpage.
// -----------------------------------------------------------------------------

export interface GuestStaySummary {
  base: ResolvedStayBase;
  sections: Awaited<ReturnType<typeof listGuideSectionsForGuest>>;
  wifi: Awaited<ReturnType<typeof listWifiForGuest>>;
  emergencyContacts: Awaited<ReturnType<typeof listEmergencyContactsForGuest>>;
  neighborhood: Awaited<ReturnType<typeof listNeighborhoodForGuest>>;
  smartLock: ReturnType<typeof presentStubLockToGuest>;
}

/**
 * Build the safe summary used by every guest sub-page. NEVER includes
 * finance, internal notes, or other guests. The smart-lock display is
 * filtered through `presentStubLockToGuest` so it only shows inside
 * the validity window.
 */
export type GuestStayResolveReason = "invalid" | "expired" | "revoked" | "not_found";

export async function getGuestStaySummaryByToken(
  token: string,
  now: Date = new Date(),
): Promise<
  | { ok: true; summary: GuestStaySummary }
  | { ok: false; reason: GuestStayResolveReason }
> {
  const resolved = await getStayByToken(token, now);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  const stay = resolved.stay;
  const [sections, wifi, contacts, places, lock] = await Promise.all([
    listGuideSectionsForGuest({
      villaId: stay.villaId,
      projectId: stay.projectId,
    }),
    listWifiForGuest({
      villaId: stay.villaId,
      projectId: stay.projectId,
    }),
    listEmergencyContactsForGuest({
      villaId: stay.villaId,
      projectId: stay.projectId,
    }),
    listNeighborhoodForGuest({
      villaId: stay.villaId,
      projectId: stay.projectId,
    }),
    createOrGetStubSmartLockCode(stay.bookingId, null).then((row) =>
      presentStubLockToGuest(row, now),
    ),
  ]);
  return {
    ok: true,
    summary: {
      base: stay,
      sections,
      wifi,
      emergencyContacts: contacts,
      neighborhood: places,
      smartLock: lock,
    },
  };
}

// Suppress unused import warning.
export const _drizzle = { asc };
