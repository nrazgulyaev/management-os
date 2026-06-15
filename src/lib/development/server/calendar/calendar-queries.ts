import "server-only";

import { eq, desc, and, or, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  workingCalendars,
  holidayCalendar,
} from "@/lib/db/schema/schedule-sophistication";
import { requireOrgId } from "@/features/auth/require-org";

export async function listCalendars() {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(workingCalendars)
    // org column is nullable — include shared NULL-org rows.
    .where(
      or(
        eq(workingCalendars.organizationId, organizationId),
        isNull(workingCalendars.organizationId),
      ),
    )
    .orderBy(desc(workingCalendars.isDefault), workingCalendars.calendarCode);
}

export async function getCalendarByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(workingCalendars)
    .where(
      and(
        eq(workingCalendars.calendarCode, code),
        // org column is nullable — allow shared NULL-org rows, reject
        // cross-org rows (return null → page notFound).
        or(
          eq(workingCalendars.organizationId, organizationId),
          isNull(workingCalendars.organizationId),
        ),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listHolidays(calendarId: string) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // holiday_calendar has no organization_id; anchor org via the parent
  // working_calendars row (nullable org → allow shared NULL-org calendars).
  return db
    .select({ holiday: holidayCalendar })
    .from(holidayCalendar)
    .innerJoin(
      workingCalendars,
      eq(workingCalendars.id, holidayCalendar.calendarId),
    )
    .where(
      and(
        eq(holidayCalendar.calendarId, calendarId),
        or(
          eq(workingCalendars.organizationId, organizationId),
          isNull(workingCalendars.organizationId),
        ),
      ),
    )
    .orderBy(holidayCalendar.holidayDate)
    .then((rows) => rows.map((r) => r.holiday));
}
