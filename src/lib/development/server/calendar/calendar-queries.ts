import "server-only";

import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  workingCalendars,
  holidayCalendar,
} from "@/lib/db/schema/schedule-sophistication";

export async function listCalendars() {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(workingCalendars)
    .orderBy(desc(workingCalendars.isDefault), workingCalendars.calendarCode);
}

export async function getCalendarByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(workingCalendars)
    .where(eq(workingCalendars.calendarCode, code))
    .limit(1);
  return rows[0] ?? null;
}

export async function listHolidays(calendarId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(holidayCalendar)
    .where(eq(holidayCalendar.calendarId, calendarId))
    .orderBy(holidayCalendar.holidayDate);
}
