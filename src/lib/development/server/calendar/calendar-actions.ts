"use server";
import "server-only";

import {} from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  workingCalendars,
  holidayCalendar,
} from "@/lib/db/schema/schedule-sophistication";

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
  await db.insert(workingCalendars).values({
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
