import "server-only";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  guestReviews,
  type GuestReview,
} from "@/lib/db/schema/owner-intelligence";
import { ownershipShares } from "@/lib/db/schema/ownership";
import { villas, projects } from "@/lib/db/schema/projects";
import { aggregateReviewRating } from "./health-pure";

/**
 * Reviews services — owner-safe projections.
 *
 * Owner reads NEVER include guest email/phone/booking_id internals.
 * Tests pin the projection shape.
 */

export interface OwnerReviewView {
  id: string;
  villaId: string | null;
  projectId: string | null;
  villaCode: string | null;
  projectName: string | null;
  reviewerDisplayName: string | null;
  reviewerCountry: string | null;
  rating: number | null;
  text: string | null;
  reviewDate: string | null;
  source: string;
  sentiment: string | null;
}

export async function listOwnerVisibleReviews(opts?: {
  villaId?: string;
  projectId?: string;
  ownerId?: string;
  limit?: number;
}): Promise<OwnerReviewView[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [
    eq(guestReviews.ownerVisible, true),
    eq(guestReviews.status, "published"),
  ];
  if (opts?.villaId) filters.push(eq(guestReviews.villaId, opts.villaId));
  if (opts?.projectId)
    filters.push(eq(guestReviews.projectId, opts.projectId));
  if (opts?.ownerId) {
    const villaIds = (
      await db
        .select({ villaId: ownershipShares.villaId })
        .from(ownershipShares)
        .where(
          and(
            eq(ownershipShares.ownerId, opts.ownerId),
            eq(ownershipShares.status, "active"),
          ),
        )
    )
      .map((r) => r.villaId)
      .filter((v): v is string => Boolean(v));
    const projectIds = (
      await db
        .select({ projectId: ownershipShares.projectId })
        .from(ownershipShares)
        .where(
          and(
            eq(ownershipShares.ownerId, opts.ownerId),
            eq(ownershipShares.status, "active"),
          ),
        )
    )
      .map((r) => r.projectId)
      .filter((v): v is string => Boolean(v));
    if (villaIds.length === 0 && projectIds.length === 0) return [];
    filters.push(
      sql`(${guestReviews.villaId} IN (${sql.raw(
        villaIds
          .map((id) => `'${id}'::uuid`)
          .concat(["'00000000-0000-0000-0000-000000000000'::uuid"])
          .join(","),
      )}) OR ${guestReviews.projectId} IN (${sql.raw(
        projectIds
          .map((id) => `'${id}'::uuid`)
          .concat(["'00000000-0000-0000-0000-000000000000'::uuid"])
          .join(","),
      )}))`,
    );
  }
  const rows = await db
    .select({
      r: guestReviews,
      villaCode: villas.unitCode,
      projectName: projects.name,
    })
    .from(guestReviews)
    .leftJoin(villas, eq(villas.id, guestReviews.villaId))
    .leftJoin(projects, eq(projects.id, guestReviews.projectId))
    .where(and(...filters))
    .orderBy(desc(guestReviews.reviewDate))
    .limit(opts?.limit ?? 100);
  return rows.map(({ r, villaCode, projectName }) => ({
    id: r.id,
    villaId: r.villaId ?? null,
    projectId: r.projectId ?? null,
    villaCode: villaCode ?? null,
    projectName: projectName ?? null,
    reviewerDisplayName: r.reviewerDisplayName ?? null,
    reviewerCountry: r.reviewerCountry ?? null,
    rating: r.rating !== null ? Number(r.rating) : null,
    text: r.text ?? null,
    reviewDate: (r.reviewDate as unknown as string) ?? null,
    source: r.source,
    sentiment: r.sentiment ?? null,
  }));
}

/**
 * Internal admin listing — includes hidden / draft / flagged rows so
 * ops can triage. NEVER projected to the owner UI.
 */
export interface AdminReviewView extends OwnerReviewView {
  ownerVisible: boolean;
  publicVisible: boolean;
  status: string;
  responseText: string | null;
  bookingId: string | null;
  createdAt: string;
}

export async function listAdminReviews(opts?: {
  villaId?: string;
  status?: "draft" | "published" | "hidden" | "flagged";
  source?: string;
  limit?: number;
}): Promise<AdminReviewView[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters = [eq(guestReviews.organizationId, organizationId)];
  if (opts?.villaId) filters.push(eq(guestReviews.villaId, opts.villaId));
  if (opts?.status) filters.push(eq(guestReviews.status, opts.status));
  if (opts?.source) filters.push(eq(guestReviews.source, opts.source));
  const rows = await db
    .select({
      r: guestReviews,
      villaCode: villas.unitCode,
      projectName: projects.name,
    })
    .from(guestReviews)
    .leftJoin(villas, eq(villas.id, guestReviews.villaId))
    .leftJoin(projects, eq(projects.id, guestReviews.projectId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(guestReviews.reviewDate))
    .limit(opts?.limit ?? 200);
  return rows.map(({ r, villaCode, projectName }) => ({
    id: r.id,
    villaId: r.villaId ?? null,
    projectId: r.projectId ?? null,
    villaCode: villaCode ?? null,
    projectName: projectName ?? null,
    reviewerDisplayName: r.reviewerDisplayName ?? null,
    reviewerCountry: r.reviewerCountry ?? null,
    rating: r.rating !== null ? Number(r.rating) : null,
    text: r.text ?? null,
    reviewDate: (r.reviewDate as unknown as string) ?? null,
    source: r.source,
    sentiment: r.sentiment ?? null,
    ownerVisible: r.ownerVisible,
    publicVisible: r.publicVisible,
    status: r.status,
    responseText: r.responseText ?? null,
    bookingId: r.bookingId ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getReviewStatsForVilla(
  villaId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<{ average: number | null; count: number; negative: number }> {
  const db = getDb();
  if (!db) return { average: null, count: 0, negative: 0 };
  const filters = [
    eq(guestReviews.villaId, villaId),
    eq(guestReviews.status, "published"),
  ];
  if (periodStart && periodEnd) {
    filters.push(
      sql`(${guestReviews.reviewDate} is null or (${guestReviews.reviewDate} >= ${periodStart} and ${guestReviews.reviewDate} <= ${periodEnd}))`,
    );
  }
  const rows = await db
    .select({
      rating: guestReviews.rating,
      sentiment: guestReviews.sentiment,
      ownerVisible: guestReviews.ownerVisible,
      status: guestReviews.status,
    })
    .from(guestReviews)
    .where(and(...filters));
  const agg = aggregateReviewRating(
    rows.map((r) => ({
      rating: r.rating !== null ? Number(r.rating) : null,
      status: r.status,
      ownerVisible: r.ownerVisible,
    })),
    { ownerMode: false },
  );
  return {
    average: agg.average,
    count: agg.sampleSize,
    negative: rows.filter((r) => r.sentiment === "negative").length,
  };
}

// Admin reads.

export async function getReviewById(
  id: string,
): Promise<GuestReview | null> {
  const db = getDb();
  if (!db) return null;
  // TENANCY (AUTHZ_SCOPE): guest_reviews.organizationId is a nullable backfill
  // column (migration 0154). AND a legacy-safe org predicate so a cross-org
  // review id reads as not-found instead of leaking the raw record; NULL
  // (pre-threading) rows stay visible, matching this domain's action writes.
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(guestReviews)
    .where(
      and(
        eq(guestReviews.id, id),
        or(
          isNull(guestReviews.organizationId),
          eq(guestReviews.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

// Re-exports.
export { aggregateReviewRating };
export type { GuestReview };
