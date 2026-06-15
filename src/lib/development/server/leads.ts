import "server-only";

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { projects } from "@/lib/db/schema/projects";
import {
  agents,
  contactRoles,
  contacts,
  leadSources,
  type Contact,
  type ContactRole,
  type LeadSource,
} from "@/lib/db/schema/contacts";
import { unitTypes } from "@/lib/db/schema/development";
import type {
  LeadFilters,
  LeadListItem,
  LeadPipelineMetrics,
} from "@/lib/development/types/sales";

/**
 * Re-export shared types so callers that already import them from
 * `@/lib/development/server/leads` keep working. New client-side callers
 * should import directly from `@/lib/development/types/sales` to avoid
 * pulling this module's `server-only` guard into the client bundle.
 */
export type {
  LeadFilters,
  LeadListItem,
  LeadPipelineMetrics,
} from "@/lib/development/types/sales";

export {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  type LeadStatus,
} from "./leads-constants";

function isoDateOrNull(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  return d.toISOString();
}

function rowToListItem(row: {
  role: ContactRole;
  contact: Contact;
  source: LeadSource | null;
  unitTypeName: string | null;
  projectName: string | null;
  projectSlug: string | null;
  agentName: string | null;
}): LeadListItem {
  return {
    roleId: row.role.id,
    contactId: row.contact.id,
    fullName: row.contact.fullName,
    displayName: row.contact.displayName,
    email: row.contact.email,
    phone: row.contact.phone,
    preferredCommunicationChannel: row.contact.preferredCommunicationChannel,
    preferredLanguage: row.contact.preferredLanguage,
    countryOfResidence: row.contact.countryOfResidence,
    status: row.role.status,
    startedAt: isoDateOrNull(row.role.startedAt) ?? new Date().toISOString(),
    endedAt: isoDateOrNull(row.role.endedAt),
    scopeProjectId: row.role.scopeProjectId,
    projectName: row.projectName,
    projectSlug: row.projectSlug,
    unitTypeName: row.unitTypeName,
    acquisitionSource: row.contact.acquisitionSource,
    sourceCode: row.source?.sourceCode ?? null,
    agentDisplayName: row.agentName,
    notes: row.role.notes,
  };
}

/**
 * Pipeline list. Filters by project, status, source category, and agent.
 *
 * Returns mock-empty when DB isn't configured. The Sales workspace UI shows
 * an empty-state in that case.
 */
export async function getLeadsPipeline(
  filters: LeadFilters = {},
): Promise<LeadListItem[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const conditions = [
    eq(contactRoles.role, "lead"),
    eq(contactRoles.organizationId, organizationId),
    isNull(contactRoles.endedAt),
  ];
  if (filters.projectId)
    conditions.push(eq(contactRoles.scopeProjectId, filters.projectId));
  if (filters.status) conditions.push(eq(contactRoles.status, filters.status));
  if (filters.agentId) conditions.push(eq(contactRoles.agentId, filters.agentId));

  let rows = await db
    .select({
      role: contactRoles,
      contact: contacts,
      source: leadSources,
      unitTypeName: unitTypes.name,
      projectName: projects.name,
      projectSlug: projects.slug,
      agentName: contacts.fullName,
    })
    .from(contactRoles)
    .innerJoin(contacts, eq(contacts.id, contactRoles.contactId))
    .leftJoin(leadSources, eq(leadSources.id, contactRoles.sourceId))
    .leftJoin(unitTypes, eq(unitTypes.id, contactRoles.unitTypeInterestId))
    .leftJoin(projects, eq(projects.id, contactRoles.scopeProjectId))
    .leftJoin(agents, eq(agents.id, contactRoles.agentId))
    .where(and(...conditions))
    .orderBy(sql`${contactRoles.startedAt} desc`);

  if (filters.sourceCategory) {
    // Source category lives on `leadSources.sourceCategory`; the join already
    // returns the row, but we filter in app since the source table is tiny
    // and this keeps the SQL plan stable across drivers.
    rows = rows.filter(
      (r) => r.source?.sourceCategory === filters.sourceCategory,
    );
  }

  // Re-resolve the agent name correctly (the join above accidentally aliased
  // contacts.fullName which is the lead's name, not the agent's).
  // Pull all agents → contact joins once to resolve display names cheaply.
  const allAgents = await db
    .select({
      id: agents.id,
      contactName: contacts.fullName,
      agencyName: agents.agencyName,
    })
    .from(agents)
    .innerJoin(contacts, eq(contacts.id, agents.contactId))
    // `agents.organization_id` is nullable (migration 0154 backfill): keep
    // shared/seed agents visible while excluding other tenants' agents.
    .where(
      or(
        eq(agents.organizationId, organizationId),
        isNull(agents.organizationId),
      ),
    );
  const agentNameById = new Map(
    allAgents.map((a) => [a.id, a.agencyName ?? a.contactName]),
  );

  return rows.map((r) =>
    rowToListItem({
      ...r,
      agentName: r.role.agentId ? (agentNameById.get(r.role.agentId) ?? null) : null,
    }),
  );
}

export async function getProjectLeads(projectId: string): Promise<LeadListItem[]> {
  return getLeadsPipeline({ projectId });
}

export async function getLeadDetail(
  contactRoleId: string,
): Promise<LeadListItem | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      role: contactRoles,
      contact: contacts,
      source: leadSources,
      unitTypeName: unitTypes.name,
      projectName: projects.name,
      projectSlug: projects.slug,
    })
    .from(contactRoles)
    .innerJoin(contacts, eq(contacts.id, contactRoles.contactId))
    .leftJoin(leadSources, eq(leadSources.id, contactRoles.sourceId))
    .leftJoin(unitTypes, eq(unitTypes.id, contactRoles.unitTypeInterestId))
    .leftJoin(projects, eq(projects.id, contactRoles.scopeProjectId))
    .where(
      and(
        eq(contactRoles.id, contactRoleId),
        eq(contactRoles.organizationId, organizationId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  let agentName: string | null = null;
  if (row.role.agentId) {
    const a = await db
      .select({
        contactName: contacts.fullName,
        agencyName: agents.agencyName,
      })
      .from(agents)
      .innerJoin(contacts, eq(contacts.id, agents.contactId))
      .where(eq(agents.id, row.role.agentId))
      .limit(1);
    agentName = a[0]?.agencyName ?? a[0]?.contactName ?? null;
  }

  return rowToListItem({
    ...row,
    agentName,
  });
}

export async function getLeadPipelineMetrics(
  filters: LeadFilters = {},
): Promise<LeadPipelineMetrics> {
  const db = getDb();
  if (!db) {
    return {
      total: 0,
      newThisWeek: 0,
      qualified: 0,
      inNegotiation: 0,
      convertedMtd: 0,
      lostMtd: 0,
    };
  }
  const organizationId = await requireOrgId();

  // One round-trip for all six counts via FILTER aggregation. The earlier
  // implementation issued six separate SELECT count(*)s sequentially, each
  // holding a connection from the (small) pool — under concurrent page
  // loads in dev mode that starved the pool and caused the page to hang.
  // See `tests/diag-sales-page.ts` for the timing comparison.
  const projectFilter = filters.projectId
    ? sql`scope_project_id = ${filters.projectId}`
    : sql`true`;

  const [row] = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE ended_at IS NULL)
        AS total,
      count(*) FILTER (
        WHERE status = 'new'
          AND started_at >= now() - interval '7 days'
      ) AS new_this_week,
      count(*) FILTER (
        WHERE status = 'qualified' AND ended_at IS NULL
      ) AS qualified,
      count(*) FILTER (
        WHERE status = 'negotiation' AND ended_at IS NULL
      ) AS in_negotiation,
      count(*) FILTER (
        WHERE end_reason = 'converted'
          AND ended_at >= date_trunc('month', now())
      ) AS converted_mtd,
      count(*) FILTER (
        WHERE end_reason = 'lost'
          AND ended_at >= date_trunc('month', now())
      ) AS lost_mtd
    FROM contact_roles
    WHERE role = 'lead'
      AND organization_id = ${organizationId}
      AND ${projectFilter};
  `);

  const r = (row ?? {}) as Record<string, string | number | null>;
  const num = (v: string | number | null | undefined) =>
    v === null || v === undefined ? 0 : Number(v);
  return {
    total: num(r.total),
    newThisWeek: num(r.new_this_week),
    qualified: num(r.qualified),
    inNegotiation: num(r.in_negotiation),
    convertedMtd: num(r.converted_mtd),
    lostMtd: num(r.lost_mtd),
  };
}

export type ActiveLeadSourceOption = Pick<
  LeadSource,
  "id" | "sourceCode" | "sourceCategory" | "campaignName"
>;

export async function getActiveLeadSources(): Promise<ActiveLeadSourceOption[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      id: leadSources.id,
      sourceCode: leadSources.sourceCode,
      sourceCategory: leadSources.sourceCategory,
      campaignName: leadSources.campaignName,
    })
    .from(leadSources)
    .where(
      and(
        eq(leadSources.isActive, true),
        // `lead_sources.organization_id` is nullable (migration 0154):
        // keep shared/default-org sources visible, exclude other tenants'.
        or(
          eq(leadSources.organizationId, organizationId),
          isNull(leadSources.organizationId),
        ),
      ),
    )
    .orderBy(leadSources.sourceCode);
  return rows;
}
