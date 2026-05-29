import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
// SHAPE-FIX-1 / DAILY-DIGEST P0 — rowsOf handles postgres-js Array shape.
// TODO(DB-SHAPE-CODEMOD-1): adjacent files in this module still pending full sweep.

/**
 * Sprint TASK-6-DATA-PART-1 — Mgmt OS Operations cabinet read aggregates.
 *
 * Mgmt-side tables (`villas`, `bookings`, `maintenance_tickets`,
 * `maintenance_templates`, `operation_tasks`) have no `organization_id`
 * column — single-tenant pattern in the current schema.
 *
 * Housekeeping + service requests + preventive schedule rows have no
 * seed in DEMO-2. Those readers return [] and the cabinet renders
 * friendly empty states.
 */

export interface OperationsKpis {
  turnoversToday: number;
  arrivalsToday: number;
  ticketsOpen: number;
  preventiveDue: number;
  serviceRequestsOpen: number;
  housekeepingTasks: number;
}

export async function getOperationsKpis(): Promise<OperationsKpis> {
  const db = getDb();
  if (!db) {
    return {
      turnoversToday: 0,
      arrivalsToday: 0,
      ticketsOpen: 0,
      preventiveDue: 0,
      serviceRequestsOpen: 0,
      housekeepingTasks: 0,
    };
  }
  const rows = await db.execute<{
    turnovers: string;
    arrivals: string;
    tickets_open: string;
    service_open: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM bookings
        WHERE check_out = CURRENT_DATE) AS turnovers,
      (SELECT COUNT(*)::text FROM bookings
        WHERE check_in = CURRENT_DATE
          AND status IN ('confirmed','checked_in')) AS arrivals,
      (SELECT COUNT(*)::text FROM maintenance_tickets
        WHERE status NOT IN ('resolved','closed','cancelled')) AS tickets_open,
      COALESCE((SELECT COUNT(*)::text FROM service_requests
        WHERE status NOT IN ('completed','cancelled')), '0') AS service_open
  `);
  const r = rowsOf<{
    turnovers: string;
    arrivals: string;
    tickets_open: string;
    service_open: string;
  }>(rows)[0];
  return {
    turnoversToday: Number(r?.turnovers ?? "0"),
    arrivalsToday: Number(r?.arrivals ?? "0"),
    ticketsOpen: Number(r?.tickets_open ?? "0"),
    preventiveDue: 0,
    serviceRequestsOpen: Number(r?.service_open ?? "0"),
    housekeepingTasks: 0,
  };
}

export type VillaState =
  | "ready"
  | "occupied"
  | "cleaning"
  | "inspection"
  | "maintenance"
  | "ooo"
  | "owner_stay"
  | "checkout_pending";

export interface VillaStatusTile {
  villaId: string;
  villaCode: string;
  state: VillaState;
}

/** Derives villa state from the villa's `status` column + active booking. */
export async function getVillaStatusBoard(): Promise<VillaStatusTile[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{
    id: string;
    unit_code: string;
    status: string;
    has_active_booking: string;
  }>(sql`
    SELECT v.id::text                          AS id,
           v.unit_code                           AS unit_code,
           v.status                              AS status,
           (EXISTS (
             SELECT 1 FROM bookings b
              WHERE b.villa_id = v.id
                AND CURRENT_DATE >= b.check_in
                AND CURRENT_DATE <  b.check_out
                AND b.status IN ('confirmed','checked_in')
           ))::text                              AS has_active_booking
      FROM villas v
     WHERE v.status NOT IN ('archived')
     ORDER BY v.unit_code ASC
  `);
  return rowsOf<{
    id: string;
    unit_code: string;
    status: string;
    has_active_booking: string;
  }>(rows).map((r) => {
    let state: VillaState;
    if (r.has_active_booking === "true") state = "occupied";
    else if (r.status === "cleaning") state = "cleaning";
    else if (r.status === "inspection") state = "inspection";
    else if (r.status === "maintenance_blocked") state = "maintenance";
    else if (r.status === "out_of_service") state = "ooo";
    else if (r.status === "owner_stay") state = "owner_stay";
    else if (r.status === "checkout_pending") state = "checkout_pending";
    else state = "ready";
    return { villaId: r.id, villaCode: r.unit_code, state };
  });
}

export interface MaintenanceTicketRow {
  id: string;
  ticketCode: string;
  villaCode: string | null;
  title: string;
  issueCategory: string;
  severity: string;
  status: string;
  reportedAt: string | null;
  daysOpen: number;
}

export async function getMaintenanceTickets(limit = 12): Promise<MaintenanceTicketRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{
    id: string;
    ticket_code: string;
    villa_code: string | null;
    title: string;
    category: string;
    severity: string;
    status: string;
    reported_at: string | null;
    days_open: string;
  }>(sql`
    SELECT mt.id::text                                           AS id,
           mt.ticket_code                                          AS ticket_code,
           v.unit_code                                             AS villa_code,
           mt.title                                                AS title,
           mt.issue_category                                       AS category,
           mt.severity                                             AS severity,
           mt.status                                               AS status,
           mt.reported_at::text                                    AS reported_at,
           COALESCE(EXTRACT(DAY FROM (NOW() - mt.reported_at))::text, '0') AS days_open
      FROM maintenance_tickets mt
      LEFT JOIN villas v ON v.id = mt.villa_id
     WHERE mt.status NOT IN ('closed','cancelled')
     ORDER BY mt.reported_at DESC NULLS LAST
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    ticket_code: string;
    villa_code: string | null;
    title: string;
    category: string;
    severity: string;
    status: string;
    reported_at: string | null;
    days_open: string;
  }>(rows).map((r) => ({
    id: r.id,
    ticketCode: r.ticket_code,
    villaCode: r.villa_code,
    title: r.title.replace(/^\[DEMO2\] /, ""),
    issueCategory: r.category,
    severity: r.severity,
    status: r.status,
    reportedAt: r.reported_at,
    daysOpen: Number(r.days_open || 0),
  }));
}

export interface PreventiveRow {
  templateKey: string;
  templateName: string;
  category: string;
  defaultFrequency: string;
  villaCode: string | null;
  dueOn: string | null;
}

/** No `preventive_maintenance_runs` schedule rows seeded in DEMO-2 —
 *  return the templates themselves so the cabinet can render a
 *  preview of what would land here once the schedule populates. */
export async function getPreventiveUpcoming(limit = 8): Promise<PreventiveRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{
    key: string;
    name: string;
    category: string;
    default_frequency: string;
  }>(sql`
    SELECT key, name, category, default_frequency
      FROM maintenance_templates
     WHERE status = 'active'
     ORDER BY default_interval_days ASC NULLS LAST, name ASC
     LIMIT ${limit}
  `);
  return rowsOf<{
    key: string;
    name: string;
    category: string;
    default_frequency: string;
  }>(rows).map((r) => ({
    templateKey: r.key,
    templateName: r.name.replace(/^\[DEMO2\] /, ""),
    category: r.category,
    defaultFrequency: r.default_frequency,
    villaCode: null,
    dueOn: null,
  }));
}

export interface HousekeepingRow {
  taskId: string;
  villaCode: string;
  taskCode: string;
  scheduledAt: string;
  assigneeName: string | null;
  progressPct: number;
  status: string;
  priority: string;
}

/** No housekeeping tasks seeded — `operation_tasks` schema exists but
 *  DEMO-2 didn't populate it. Cabinet shows an empty-state row. */
export async function getHousekeepingProgress(): Promise<HousekeepingRow[]> {
  return [];
}

export interface ServiceRequestRow {
  id: string;
  code: string;
  villaCode: string | null;
  guestName: string | null;
  requestType: string;
  status: string;
  vendorName: string | null;
}

/** No `service_requests` rows seeded. */
export async function getServiceRequestsForCabinet(): Promise<ServiceRequestRow[]> {
  return [];
}

// =============================================================================
// DAILY-DIGEST-SPRINT-1 P2 — date-scoped operational incidents for the Daily
// Digest agent.
// =============================================================================

export interface DigestOperationalIncidentsForDate {
  date: string;
  newTicketsCount: number;
  ticketsResolvedCount: number;
  highSeverityOpenCount: number;
  newServiceRequestsCount: number;
  topNewTickets: Array<{
    ticketCode: string;
    villaCode: string | null;
    title: string;
    severity: string;
    category: string;
  }>;
}

/**
 * Maintenance + service activity logged on the digest date. Includes
 * a top-3 sample of newly-opened tickets so the agent can flag
 * specific issues. No org filter — maintenance_tickets +
 * service_requests have no organization_id column today.
 */
export async function getOperationalIncidentsForDate(input: {
  orgId: string;
  date: string;
}): Promise<DigestOperationalIncidentsForDate> {
  const db = getDb();
  if (!db) {
    return {
      date: input.date,
      newTicketsCount: 0,
      ticketsResolvedCount: 0,
      highSeverityOpenCount: 0,
      newServiceRequestsCount: 0,
      topNewTickets: [],
    };
  }

  const aggRows = await db.execute<{
    new_tickets: string;
    resolved: string;
    high_open: string;
    new_service: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM maintenance_tickets
        WHERE reported_at::date = ${input.date}::date) AS new_tickets,
      (SELECT COUNT(*)::text FROM maintenance_tickets
        WHERE status IN ('resolved','closed')
          AND updated_at::date = ${input.date}::date) AS resolved,
      (SELECT COUNT(*)::text FROM maintenance_tickets
        WHERE severity IN ('p0','p1')
          AND status NOT IN ('resolved','closed','cancelled')) AS high_open,
      (SELECT COUNT(*)::text FROM service_requests
        WHERE created_at::date = ${input.date}::date) AS new_service
  `);
  const agg = rowsOf<{
    new_tickets: string;
    resolved: string;
    high_open: string;
    new_service: string;
  }>(aggRows)[0];

  const top = await db.execute<{
    ticket_code: string;
    villa_code: string | null;
    title: string;
    severity: string;
    category: string;
  }>(sql`
    SELECT mt.ticket_code,
           v.unit_code        AS villa_code,
           mt.title           AS title,
           mt.severity        AS severity,
           mt.issue_category  AS category
      FROM maintenance_tickets mt
      LEFT JOIN villas v ON v.id = mt.villa_id
     WHERE mt.reported_at::date = ${input.date}::date
     ORDER BY CASE mt.severity
                WHEN 'p0' THEN 0
                WHEN 'p1' THEN 1
                WHEN 'p2' THEN 2
                WHEN 'p3' THEN 3
                ELSE 4 END,
              mt.reported_at DESC
     LIMIT 3
  `);
  const topNewTickets = rowsOf<{
    ticket_code: string;
    villa_code: string | null;
    title: string;
    severity: string;
    category: string;
  }>(top).map((r) => ({
    ticketCode: r.ticket_code,
    villaCode: r.villa_code,
    title: r.title.replace(/^\[DEMO2\] /, ""),
    severity: r.severity,
    category: r.category,
  }));

  return {
    date: input.date,
    newTicketsCount: Number(agg?.new_tickets ?? "0"),
    ticketsResolvedCount: Number(agg?.resolved ?? "0"),
    highSeverityOpenCount: Number(agg?.high_open ?? "0"),
    newServiceRequestsCount: Number(agg?.new_service ?? "0"),
    topNewTickets,
  };
}
