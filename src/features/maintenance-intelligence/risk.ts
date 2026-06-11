import "server-only";

import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  maintenanceRiskEvents,
  utilityAccounts,
  utilityReadings,
  villaMaintenancePlans,
} from "@/lib/db/schema/maintenance-intelligence";
import { villaCalendarBlocks, villaReadinessStates } from "@/lib/db/schema/availability";
import { bookings } from "@/lib/db/schema/bookings";
import { maintenanceTickets } from "@/lib/db/schema/operations";
import { villas, projects } from "@/lib/db/schema/projects";
import {
  classifyReadingFreshness,
  classifyUtilityBalance,
  balanceLevelToRiskType,
  formatBalanceLabel,
  levelToSeverity,
} from "@/features/utilities/risk-pure";
import { queueNotification } from "@/features/notifications/services";

/**
 * V9D — risk scanner. Walks a small set of read-only signals and opens
 * `maintenance_risk_events` rows for anything that needs operator
 * attention. Idempotent via the partial unique index `(risk_type,
 * source_type, source_id) WHERE status='open'`.
 *
 * Risks scanned:
 *   - overdue_maintenance              (plan.next_due_at < now, status='active')
 *   - utility_low_balance / critical   (latest reading vs thresholds)
 *   - no_recent_reading                (no reading in 30 days for active accounts)
 *   - repeated_ticket                  (3+ open maintenance_tickets per villa)
 *   - upcoming_guest_conflict          (active maintenance_block overlaps a confirmed booking)
 *   - arrival_not_ready                (arrival today + readiness != 'ready' / 'cleaning')
 *
 * Each open event also queues an `in_app` notification to internal
 * roles (operations_manager, property_manager, finance_manager) per
 * type. Best-effort; failures don't block the scan.
 */

const STALE_READING_DAYS = 30;
const REPEATED_TICKET_THRESHOLD = 3;

interface UpsertRiskInput {
  organizationId: string | null;
  villaId: string | null;
  projectId: string | null;
  riskType:
    | "overdue_maintenance"
    | "utility_low_balance"
    | "utility_critical_balance"
    | "no_recent_reading"
    | "repeated_ticket"
    | "upcoming_guest_conflict"
    | "arrival_not_ready";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string | null;
  sourceType: string;
  sourceId: string;
}

async function upsertRisk(input: UpsertRiskInput) {
  const db = getDb()!;
  await db
    .insert(maintenanceRiskEvents)
    .values({
      organizationId: input.organizationId,
      villaId: input.villaId,
      projectId: input.projectId,
      riskType: input.riskType,
      severity: input.severity,
      title: input.title,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: "open",
    })
    .onConflictDoNothing();
}

const NOTIFICATION_TEMPLATE_BY_RISK: Record<UpsertRiskInput["riskType"], string> = {
  overdue_maintenance: "maintenance.overdue",
  utility_low_balance: "utility.low_balance",
  utility_critical_balance: "utility.critical_balance",
  no_recent_reading: "utility.payment_due", // closest existing meaning
  repeated_ticket: "maintenance.overdue",
  upcoming_guest_conflict: "readiness.arrival_not_ready",
  arrival_not_ready: "readiness.arrival_not_ready",
};

const NOTIFICATION_ROLE_BY_RISK: Record<UpsertRiskInput["riskType"], string[]> = {
  overdue_maintenance: ["operations_manager", "property_manager"],
  utility_low_balance: ["operations_manager", "finance_manager"],
  utility_critical_balance: [
    "operations_manager",
    "property_manager",
    "finance_manager",
  ],
  no_recent_reading: ["operations_manager"],
  repeated_ticket: ["operations_manager", "property_manager"],
  upcoming_guest_conflict: ["operations_manager", "property_manager"],
  arrival_not_ready: ["operations_manager", "property_manager"],
};

async function queueRiskNotifications(input: UpsertRiskInput) {
  const templateKey = NOTIFICATION_TEMPLATE_BY_RISK[input.riskType];
  const roles = NOTIFICATION_ROLE_BY_RISK[input.riskType] ?? [];
  for (const roleKey of roles) {
    try {
      await queueNotification({
        recipientType: "role",
        organizationId: input.organizationId ?? undefined,
        channel: "in_app",
        templateKey,
        title: input.title,
        body: input.description ?? input.title,
        payload: {
          recipientRole: roleKey,
          riskType: input.riskType,
          sourceId: input.sourceId,
        },
        priority:
          input.severity === "critical"
            ? "urgent"
            : input.severity === "high"
              ? "high"
              : "normal",
        dedupeKey: `${input.riskType}:${input.sourceId}:${roleKey}`,
      });
    } catch {
      // Best-effort.
    }
  }
}

export interface ScanOutcome {
  overdueMaintenance: number;
  utilityLowBalance: number;
  utilityCriticalBalance: number;
  noRecentReading: number;
  repeatedTicket: number;
  upcomingGuestConflict: number;
  arrivalNotReady: number;
}

export async function scanMaintenanceRisks(
  now: Date = new Date(),
): Promise<ScanOutcome> {
  const db = getDb();
  if (!db) {
    return {
      overdueMaintenance: 0,
      utilityLowBalance: 0,
      utilityCriticalBalance: 0,
      noRecentReading: 0,
      repeatedTicket: 0,
      upcomingGuestConflict: 0,
      arrivalNotReady: 0,
    };
  }

  const out: ScanOutcome = {
    overdueMaintenance: 0,
    utilityLowBalance: 0,
    utilityCriticalBalance: 0,
    noRecentReading: 0,
    repeatedTicket: 0,
    upcomingGuestConflict: 0,
    arrivalNotReady: 0,
  };

  // 1) Overdue maintenance
  const overdue = await db
    .select({
      id: villaMaintenancePlans.id,
      organizationId: villaMaintenancePlans.organizationId,
      villaId: villaMaintenancePlans.villaId,
      projectId: villaMaintenancePlans.projectId,
      planName: villaMaintenancePlans.planName,
      nextDueAt: villaMaintenancePlans.nextDueAt,
      priority: villaMaintenancePlans.priority,
    })
    .from(villaMaintenancePlans)
    .where(
      and(
        eq(villaMaintenancePlans.status, "active"),
        lt(villaMaintenancePlans.nextDueAt, now),
      ),
    );
  for (const p of overdue) {
    const ageHours = p.nextDueAt
      ? (now.getTime() - new Date(p.nextDueAt).getTime()) / 3600_000
      : 0;
    const severity =
      p.priority === "urgent" || ageHours > 7 * 24 ? "high" : "medium";
    const event: UpsertRiskInput = {
      organizationId: p.organizationId,
      villaId: p.villaId,
      projectId: p.projectId,
      riskType: "overdue_maintenance",
      severity: severity === "high" ? "high" : "medium",
      title: `Overdue maintenance: ${p.planName}`,
      description: `Plan due ${p.nextDueAt?.toISOString().slice(0, 10) ?? "today"} — generate the task or push the next_due_at.`,
      sourceType: "villa_maintenance_plan",
      sourceId: p.id,
    };
    await upsertRisk(event);
    await queueRiskNotifications(event);
    out.overdueMaintenance++;
  }

  // 2) Utility balance + 3) freshness
  const accounts = await db
    .select()
    .from(utilityAccounts)
    .where(eq(utilityAccounts.status, "active"));
  for (const a of accounts) {
    const [latest] = await db
      .select({
        balanceMinor: utilityReadings.balanceMinor,
        readingAt: utilityReadings.readingAt,
      })
      .from(utilityReadings)
      .where(eq(utilityReadings.utilityAccountId, a.id))
      .orderBy(desc(utilityReadings.readingAt))
      .limit(1);

    const balanceLevel = classifyUtilityBalance(latest?.balanceMinor ?? null, {
      lowBalanceThresholdMinor: a.lowBalanceThresholdMinor,
      criticalBalanceThresholdMinor: a.criticalBalanceThresholdMinor,
    });
    const riskType = balanceLevelToRiskType(balanceLevel);
    if (riskType) {
      const event: UpsertRiskInput = {
        organizationId: a.organizationId,
        villaId: a.villaId,
        projectId: a.projectId,
        riskType,
        severity: levelToSeverity(balanceLevel),
        title:
          balanceLevel === "critical"
            ? `Critical utility balance: ${a.utilityType}`
            : `Low utility balance: ${a.utilityType}`,
        description: `Balance ${formatBalanceLabel(latest?.balanceMinor ?? null, a.currency)}.`,
        sourceType: "utility_account",
        sourceId: a.id,
      };
      await upsertRisk(event);
      await queueRiskNotifications(event);
      if (riskType === "utility_critical_balance") out.utilityCriticalBalance++;
      else out.utilityLowBalance++;
    }

    const freshness = classifyReadingFreshness({
      lastReadingAt: latest?.readingAt ?? null,
      now,
      staleAfterDays: STALE_READING_DAYS,
    });
    if (freshness !== "ok") {
      const event: UpsertRiskInput = {
        organizationId: a.organizationId,
        villaId: a.villaId,
        projectId: a.projectId,
        riskType: "no_recent_reading",
        severity: levelToSeverity(freshness),
        title: `No recent reading: ${a.utilityType}`,
        description: `Last reading ${latest?.readingAt?.toISOString().slice(0, 10) ?? "never"}.`,
        sourceType: "utility_account",
        sourceId: a.id,
      };
      await upsertRisk(event);
      await queueRiskNotifications(event);
      out.noRecentReading++;
    }
  }

  // 4) Repeated tickets — same villa with ≥ threshold open tickets.
  const repeats = await db
    .select({
      villaId: maintenanceTickets.villaId,
      c: sql<number>`count(*)`,
    })
    .from(maintenanceTickets)
    .where(
      inArray(maintenanceTickets.status, ["open", "in_progress", "needs_review"]),
    )
    .groupBy(maintenanceTickets.villaId);
  for (const r of repeats) {
    if (Number(r.c) < REPEATED_TICKET_THRESHOLD) continue;
    if (!r.villaId) continue;
    // No org on maintenance_tickets — resolve via the villa's project.
    const [vp] = await db
      .select({ organizationId: projects.organizationId })
      .from(villas)
      .leftJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(villas.id, r.villaId))
      .limit(1);
    const event: UpsertRiskInput = {
      organizationId: vp?.organizationId ?? null,
      villaId: r.villaId,
      projectId: null,
      riskType: "repeated_ticket",
      severity: "high",
      title: `Repeated tickets at villa`,
      description: `${r.c} open maintenance tickets — review root cause.`,
      sourceType: "villa",
      sourceId: r.villaId,
    };
    await upsertRisk(event);
    await queueRiskNotifications(event);
    out.repeatedTicket++;
  }

  // 5) Upcoming guest conflict — an active maintenance_block overlapping a
  //    confirmed booking in the next 7 days.
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const overlap = await db
    .select({
      blockId: villaCalendarBlocks.id,
      organizationId: villaCalendarBlocks.organizationId,
      villaId: villaCalendarBlocks.villaId,
      projectId: villaCalendarBlocks.projectId,
      startsAt: villaCalendarBlocks.startsAt,
      endsAt: villaCalendarBlocks.endsAt,
    })
    .from(villaCalendarBlocks)
    .where(
      and(
        eq(villaCalendarBlocks.status, "active"),
        eq(villaCalendarBlocks.blockType, "maintenance_block"),
        lt(villaCalendarBlocks.startsAt, horizon),
        gte(villaCalendarBlocks.endsAt, now),
      ),
    );
  for (const b of overlap) {
    // Any confirmed booking on the same villa intersecting the block?
    const startDate = b.startsAt.toISOString().slice(0, 10);
    const endDate = b.endsAt.toISOString().slice(0, 10);
    const [hit] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.villaId, b.villaId),
          inArray(bookings.status, ["confirmed", "checked_in"]),
          lte(bookings.checkIn, endDate),
          gte(bookings.checkOut, startDate),
        ),
      )
      .limit(1);
    if (!hit) continue;
    const event: UpsertRiskInput = {
      organizationId: b.organizationId,
      villaId: b.villaId,
      projectId: b.projectId,
      riskType: "upcoming_guest_conflict",
      severity: "high",
      title: `Maintenance block overlaps a guest stay`,
      description: `Block ${startDate} → ${endDate} conflicts with a confirmed booking.`,
      sourceType: "villa_calendar_block",
      sourceId: b.blockId,
    };
    await upsertRisk(event);
    await queueRiskNotifications(event);
    out.upcomingGuestConflict++;
  }

  // 6) Arrival not ready — a confirmed booking checking in TODAY whose
  //    villa readiness is not 'ready' / 'occupied' / 'cleaning'.
  const today = now.toISOString().slice(0, 10);
  const todaysArrivals = await db
    .select({
      bookingId: bookings.id,
      organizationId: bookings.organizationId,
      villaId: bookings.villaId,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.checkIn, today),
        inArray(bookings.status, ["confirmed", "checked_in"]),
      ),
    );
  for (const a of todaysArrivals) {
    const [readiness] = await db
      .select({ status: villaReadinessStates.readinessStatus })
      .from(villaReadinessStates)
      .where(
        and(
          eq(villaReadinessStates.villaId, a.villaId),
          isNull(villaReadinessStates.effectiveTo),
        ),
      )
      .limit(1);
    const status = readiness?.status ?? "unknown";
    if (
      status === "ready" ||
      status === "occupied" ||
      status === "cleaning" ||
      status === "inspection"
    ) {
      continue;
    }
    const event: UpsertRiskInput = {
      organizationId: a.organizationId,
      villaId: a.villaId,
      projectId: null,
      riskType: "arrival_not_ready",
      severity: "high",
      title: `Arrival today, villa not ready`,
      description: `Readiness state is "${status}". Confirm cleaning + inspection before guest arrival.`,
      sourceType: "booking",
      sourceId: a.bookingId,
    };
    await upsertRisk(event);
    await queueRiskNotifications(event);
    out.arrivalNotReady++;
  }

  return out;
}

export async function scanMaintenanceRisksAction(): Promise<{
  ok: boolean;
  outcome: ScanOutcome;
}> {
  const out = await scanMaintenanceRisks();
  return { ok: true, outcome: out };
}
