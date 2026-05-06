import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db/client";
import { owners } from "@/lib/db/schema/ownership";
import { ownerCalendarPreferences } from "@/lib/db/schema/owner-intelligence";

export const metadata = { title: "Owner calendar preferences" };
export const dynamic = "force-dynamic";

export default async function OwnerPreferencesAdminPage() {
  const db = getDb();
  const ownersAndPrefs = db
    ? await db
        .select({
          owner: owners,
          pref: ownerCalendarPreferences,
        })
        .from(owners)
        .leftJoin(
          ownerCalendarPreferences,
          eq(ownerCalendarPreferences.ownerId, owners.id),
        )
        .limit(200)
    : [];
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          {
            label: "Owner intelligence",
            href: "/dashboard/owner-intelligence",
          },
          { label: "Preferences" },
        ]}
        title="Owner calendar preferences"
        description="Each owner can decide how the owner portal displays their calendar — guest names, country, channel labels, maintenance details, density. Defaults are applied when no row exists."
      />
      <Section eyebrow="Preferences" title={`${ownersAndPrefs.length} owners`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Currency</th>
                <th className="px-4 py-3">Guest names</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Maintenance</th>
                <th className="px-4 py-3">Density</th>
              </tr>
            </thead>
            <tbody>
              {ownersAndPrefs.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No owners on file.
                  </td>
                </tr>
              )}
              {ownersAndPrefs.map(({ owner, pref }) => (
                <tr key={owner.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-xs">
                    <span className="text-ink font-medium">
                      {owner.displayName}
                    </span>
                    <div className="text-[10px] text-ink-tertiary font-mono">
                      {owner.id.slice(0, 8)}…
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {pref?.defaultCurrency ?? "USD"}
                  </td>
                  <Cell on={pref?.showGuestNames ?? true} />
                  <Cell on={pref?.showGuestCountry ?? true} />
                  <Cell on={pref?.showChannelLabels ?? true} />
                  <Cell on={pref?.showMaintenanceDetails ?? true} />
                  <td className="px-4 py-3 text-xs capitalize">
                    {pref?.calendarDensity ?? "comfortable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <p className="text-xs text-ink-tertiary">
        Owners update their own preferences inside /owner; this admin
        view is read-only. The schema enforces one row per owner via
        the `owner_calendar_preferences_owner_unique` index.
      </p>
    </div>
  );
}

function Cell({ on }: { on: boolean }) {
  return (
    <td className="px-4 py-3">
      <Badge tone={on ? "success" : "neutral"}>
        {on ? "shown" : "hidden"}
      </Badge>
    </td>
  );
}
