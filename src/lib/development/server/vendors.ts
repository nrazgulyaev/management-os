import "server-only";

import { eq, sql, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  vendors,
  vendorEngagements,
} from "@/lib/db/schema/site-operations";
import { projects } from "@/lib/db/schema/projects";
import type {
  EngagementStatus,
  VendorStatus,
  VendorType,
} from "@/lib/development/constants/vendor-constants";

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);
const toNum = (v: unknown): number =>
  v === null || v === undefined ? 0 : Number(v);

export interface VendorListItem {
  id: string;
  vendorCode: string;
  legalName: string;
  vendorType: VendorType;
  status: VendorStatus;
  primaryEmail: string | null;
  primaryPhone: string | null;
  whatsappPhone: string | null;
  totalCommitmentsCount: number;
  totalCommitmentsValueUsdMinor: string;
  onTimeDeliveryRate: string | null;
  qualityRating: string | null;
  lastEngagementAt: string | null;
  /** Aggregate computed from vendor_engagements join */
  activeEngagementCount: number;
}

export interface VendorFilters {
  status?: VendorStatus;
  type?: VendorType;
  projectId?: string;
}

export async function getVendors(
  filters: VendorFilters = {},
): Promise<VendorListItem[]> {
  const db = getDb();
  if (!db) return [];

  const conditions: ReturnType<typeof sql>[] = [];
  if (filters.status) conditions.push(sql`v.status = ${filters.status}`);
  if (filters.type) conditions.push(sql`v.vendor_type = ${filters.type}`);
  if (filters.projectId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM vendor_engagements e
        WHERE e.vendor_id = v.id AND e.project_id = ${filters.projectId})`,
    );
  }
  const where = conditions.length
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      v.id, v.vendor_code, v.legal_name, v.vendor_type, v.status,
      v.primary_email, v.primary_phone, v.whatsapp_phone,
      v.total_commitments_count, v.total_commitments_value_usd_minor,
      v.on_time_delivery_rate, v.quality_rating, v.last_engagement_at,
      coalesce(e.active_count, 0)::int AS active_engagement_count
    FROM vendors v
    LEFT JOIN (
      SELECT vendor_id, count(*)::int AS active_count
      FROM vendor_engagements
      WHERE status = 'active'
      GROUP BY vendor_id
    ) e ON e.vendor_id = v.id
    ${where}
    ORDER BY v.vendor_code ASC
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    vendorCode: String(r.vendor_code),
    legalName: String(r.legal_name),
    vendorType: r.vendor_type as VendorType,
    status: r.status as VendorStatus,
    primaryEmail: r.primary_email ? String(r.primary_email) : null,
    primaryPhone: r.primary_phone ? String(r.primary_phone) : null,
    whatsappPhone: r.whatsapp_phone ? String(r.whatsapp_phone) : null,
    totalCommitmentsCount: toNum(r.total_commitments_count),
    totalCommitmentsValueUsdMinor: toStr(r.total_commitments_value_usd_minor),
    onTimeDeliveryRate: r.on_time_delivery_rate
      ? String(r.on_time_delivery_rate)
      : null,
    qualityRating: r.quality_rating ? String(r.quality_rating) : null,
    lastEngagementAt: r.last_engagement_at
      ? String(r.last_engagement_at)
      : null,
    activeEngagementCount: toNum(r.active_engagement_count),
  }));
}

export async function getVendor(idOrCode: string): Promise<VendorListItem | null> {
  const list = await getVendors();
  return (
    list.find((v) => v.id === idOrCode || v.vendorCode === idOrCode) ?? null
  );
}

export interface VendorMetrics {
  totalVendors: number;
  byStatus: Record<VendorStatus, number>;
  totalCommitmentsValueUsdMinor: string;
  avgOnTimeDeliveryRate: number | null;
  avgQualityRating: number | null;
}

export async function getVendorMetrics(): Promise<VendorMetrics> {
  const db = getDb();
  if (!db) {
    return {
      totalVendors: 0,
      byStatus: { active: 0, inactive: 0, blacklisted: 0 },
      totalCommitmentsValueUsdMinor: "0",
      avgOnTimeDeliveryRate: null,
      avgQualityRating: null,
    };
  }
  const [r] = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status='active')::int AS active,
      count(*) FILTER (WHERE status='inactive')::int AS inactive,
      count(*) FILTER (WHERE status='blacklisted')::int AS blacklisted,
      coalesce(sum(total_commitments_value_usd_minor), 0)::bigint AS commitments_total,
      avg(on_time_delivery_rate) AS avg_ontime,
      avg(quality_rating) AS avg_quality
    FROM vendors
  `);
  const row = (r ?? {}) as Record<string, unknown>;
  return {
    totalVendors: toNum(row.total),
    byStatus: {
      active: toNum(row.active),
      inactive: toNum(row.inactive),
      blacklisted: toNum(row.blacklisted),
    },
    totalCommitmentsValueUsdMinor: toStr(row.commitments_total),
    avgOnTimeDeliveryRate: row.avg_ontime ? Number(row.avg_ontime) : null,
    avgQualityRating: row.avg_quality ? Number(row.avg_quality) : null,
  };
}

// ---------------------------------------------------------------------------
// Engagements
// ---------------------------------------------------------------------------

export interface VendorEngagementListItem {
  id: string;
  engagementCode: string;
  vendorId: string;
  vendorCode: string;
  vendorLegalName: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  scopeDescription: string;
  startDate: string;
  expectedEndDate: string | null;
  actualEndDate: string | null;
  status: EngagementStatus;
  commitmentLedgerId: string | null;
}

export interface VendorEngagementFilters {
  vendorId?: string;
  projectId?: string;
  status?: EngagementStatus;
}

export async function getVendorEngagements(
  filters: VendorEngagementFilters = {},
): Promise<VendorEngagementListItem[]> {
  const db = getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.vendorId) conditions.push(eq(vendorEngagements.vendorId, filters.vendorId));
  if (filters.projectId) conditions.push(eq(vendorEngagements.projectId, filters.projectId));
  if (filters.status) conditions.push(eq(vendorEngagements.status, filters.status));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: vendorEngagements.id,
      engagementCode: vendorEngagements.engagementCode,
      vendorId: vendorEngagements.vendorId,
      vendorCode: vendors.vendorCode,
      vendorLegalName: vendors.legalName,
      projectId: vendorEngagements.projectId,
      projectName: projects.name,
      projectSlug: projects.slug,
      scopeDescription: vendorEngagements.scopeDescription,
      startDate: vendorEngagements.startDate,
      expectedEndDate: vendorEngagements.expectedEndDate,
      actualEndDate: vendorEngagements.actualEndDate,
      status: vendorEngagements.status,
      commitmentLedgerId: vendorEngagements.commitmentLedgerId,
    })
    .from(vendorEngagements)
    .innerJoin(vendors, eq(vendors.id, vendorEngagements.vendorId))
    .innerJoin(projects, eq(projects.id, vendorEngagements.projectId))
    .where(where)
    .orderBy(vendorEngagements.engagementCode);

  return rows.map((r) => ({
    id: r.id,
    engagementCode: r.engagementCode,
    vendorId: r.vendorId,
    vendorCode: r.vendorCode,
    vendorLegalName: r.vendorLegalName,
    projectId: r.projectId,
    projectName: r.projectName,
    projectSlug: r.projectSlug,
    scopeDescription: r.scopeDescription,
    startDate: String(r.startDate),
    expectedEndDate: r.expectedEndDate ? String(r.expectedEndDate) : null,
    actualEndDate: r.actualEndDate ? String(r.actualEndDate) : null,
    status: r.status as EngagementStatus,
    commitmentLedgerId: r.commitmentLedgerId ?? null,
  }));
}

export async function getVendorEngagement(
  id: string,
): Promise<VendorEngagementListItem | null> {
  const list = await getVendorEngagements();
  return list.find((e) => e.id === id) ?? null;
}
