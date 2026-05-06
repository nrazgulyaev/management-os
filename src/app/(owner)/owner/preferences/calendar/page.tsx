import { inArray } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Preferences" }, { label: "Calendar" }]}
        title="Calendar preferences"
        description="Choose how the owner portal renders your calendar — guest names, country, channel labels, maintenance details, density. Defaults are applied when no row exists."
      />
      <Section eyebrow="Display" title="What you see in your calendar">
        <OwnerPreferencesForm owners={rows} />
      </Section>
    </div>
  );
}

