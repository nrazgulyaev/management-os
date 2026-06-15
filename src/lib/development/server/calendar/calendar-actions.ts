"use server";
import "server-only";

import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  workingCalendars,
  holidayCalendar,
} from "@/lib/db/schema/schedule-sophistication";
import { projects } from "@/lib/db/schema/projects";
import { vendors } from "@/lib/db/schema/site-operations";
import { requireOrgId } from "@/features/auth/require-org";

const createCalendarSchema = z.object({
  calendarCode: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[A-Z0-9_]+$/, "UPPER_SNAKE_CASE only"),
  name: z.string().min(2).max(120),
  scope: z.enum(["company_wide", "project", "vendor"]),
  workingDaysOfWeek: z.array(z.number().int().min(0).max(6)),
  workingHoursPerDay: z.number().positive(),
  projectId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  countryCode: z.string().default("ID"),
  regionCode: z.string().optional(),
});

export async function createCalendar(input: z.input<typeof createCalendarSchema>) {
  const parsed = createCalendarSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const organizationId = await requireOrgId();

  // Verify any client-supplied FK belongs to the caller's org before insert.
  if (parsed.data.projectId) {
    const [proj] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, parsed.data.projectId),
          eq(projects.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!proj) return { ok: false as const, error: "Project not found" };
  }
  if (parsed.data.vendorId) {
    const [vendor] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.id, parsed.data.vendorId),
          eq(vendors.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!vendor) return { ok: false as const, error: "Vendor not found" };
  }

  await db.insert(workingCalendars).values({
    organizationId,
    calendarCode: parsed.data.calendarCode,
    name: parsed.data.name,
    scope: parsed.data.scope,
    workingDaysOfWeek: parsed.data.workingDaysOfWeek,
    workingHoursPerDay: parsed.data.workingHoursPerDay.toString(),
    projectId: parsed.data.projectId ?? null,
    vendorId: parsed.data.vendorId ?? null,
    countryCode: parsed.data.countryCode,
    regionCode: parsed.data.regionCode ?? null,
  });
  return { ok: true as const };
}

const addHolidaySchema = z.object({
  calendarId: z.string().uuid(),
  holidayDate: z.string(),
  holidayName: z.string().min(2).max(120),
  holidayType: z.enum([
    "national_holiday",
    "regional_holiday",
    "religious_observance",
    "company_holiday",
    "project_specific",
    "site_unavailable",
    "weather_closure",
    "other_non_working",
  ]),
  isFullDay: z.boolean().default(true),
  source: z.string().optional(),
});

export async function addHoliday(input: z.input<typeof addHolidaySchema>) {
  const parsed = addHolidaySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const organizationId = await requireOrgId();

  // Verify the target calendar belongs to the caller's org (or is a shared
  // NULL-org calendar) before inserting. holiday_calendar has no
  // organization_id column — org is anchored via working_calendars.
  const [calendar] = await db
    .select({ id: workingCalendars.id })
    .from(workingCalendars)
    .where(
      and(
        eq(workingCalendars.id, parsed.data.calendarId),
        or(
          eq(workingCalendars.organizationId, organizationId),
          isNull(workingCalendars.organizationId),
        ),
      ),
    )
    .limit(1);
  if (!calendar) return { ok: false as const, error: "Calendar not found" };

  await db
    .insert(holidayCalendar)
    .values({
      calendarId: parsed.data.calendarId,
      holidayDate: parsed.data.holidayDate,
      holidayName: parsed.data.holidayName,
      holidayType: parsed.data.holidayType,
      isFullDay: parsed.data.isFullDay,
      source: parsed.data.source ?? null,
    })
    .onConflictDoNothing({
      target: [holidayCalendar.calendarId, holidayCalendar.holidayDate],
    });
  return { ok: true as const };
}
