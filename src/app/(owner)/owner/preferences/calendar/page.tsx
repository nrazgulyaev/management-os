import { inArray } from "drizzle-orm";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { getDb } from "@/lib/db/client";
import { owners } from "@/lib/db/schema/ownership";
import { ownerCalendarPreferences } from "@/lib/db/schema/owner-intelligence";
import { listOwnerIdsForCurrentUser } from "@/features/notifications/services";
import {
  OwnerPreferencesForm,
  type OwnerPreferenceRow,
} from "@/components/owner/preferences-form";

export const metadata = { title: "Calendar preferences" };
export const dynamic = "force-dynamic";

const DEFAULTS = {
  defaultCurrency: "USD",
  showGuestNames: true,
  showGuestCountry: true,
  showChannelLabels: true,
  showMaintenanceDetails: true,
  calendarDensity: "comfortable" as const,
};

export default async function OwnerCalendarPreferencesPage() {
  const db = getDb();
  const ownerIds = await listOwnerIdsForCurrentUser();
  let rows: OwnerPreferenceRow[] = [];
  if (db && ownerIds.length > 0) {
    const ownerRows = await db
      .select()
      .from(owners)
      .where(inArray(owners.id, ownerIds));
    const prefRows = await db
      .select()
      .from(ownerCalendarPreferences)
      .where(inArray(ownerCalendarPreferences.ownerId, ownerIds));
    rows = ownerRows.map((o) => {
      const pref =
        prefRows.find((p) => p.ownerId === o.id) ?? null;
      return {
        ownerId: o.id,
        ownerLabel: o.displayName,
        defaultCurrency: pref?.defaultCurrency ?? DEFAULTS.defaultCurrency,
        showGuestNames: pref?.showGuestNames ?? DEFAULTS.showGuestNames,
        showGuestCountry: pref?.showGuestCountry ?? DEFAULTS.showGuestCountry,
        showChannelLabels:
          pref?.showChannelLabels ?? DEFAULTS.showChannelLabels,
        showMaintenanceDetails:
          pref?.showMaintenanceDetails ?? DEFAULTS.showMaintenanceDetails,
        calendarDensity: pref?.calendarDensity ?? DEFAULTS.calendarDensity,
      };
    });
  }
  return (
    <>
      <SectionHeading
        eyebrow="Preferences · calendar"
        title="Calendar preferences"
        subtitle="Choose how the owner portal renders your calendar — guest names, country, channel labels, maintenance details, density. Defaults are applied when no row exists."
      />
      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        Display · what you see in your calendar
      </h2>
      <Card style={{ padding: 20 }}>
        <OwnerPreferencesForm owners={rows} />
      </Card>
    </>
  );
}

