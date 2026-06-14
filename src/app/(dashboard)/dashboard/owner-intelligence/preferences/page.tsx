import Link from "next/link";
import { eq } from "drizzle-orm";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-intelligence">Owner intelligence</Link>{" "}
            / <span>Preferences</span>
          </div>
          <h1>Owner calendar preferences</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Each owner can decide how the owner portal displays their calendar —
            guest names, country, channel labels, maintenance details, density.
            Defaults are applied when no row exists.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Preferences · {ownersAndPrefs.length} owners</div>
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Owner</th>
                <th scope="col">Currency</th>
                <th scope="col">Guest names</th>
                <th scope="col">Country</th>
                <th scope="col">Channel</th>
                <th scope="col">Maintenance</th>
                <th scope="col">Density</th>
              </tr>
            </thead>
            <tbody>
              {ownersAndPrefs.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center text-ink-tertiary"
                  >
                    No owners on file.
                  </td>
                </tr>
              )}
              {ownersAndPrefs.map(({ owner, pref }) => (
                <tr key={owner.id}>
                  <td className="text-xs">
                    <span className="row-title">
                      {owner.displayName}
                    </span>
                    <div className="text-[10px] text-ink-tertiary font-mono">
                      {owner.id.slice(0, 8)}…
                    </div>
                  </td>
                  <td className="mono text-xs">
                    {pref?.defaultCurrency ?? "USD"}
                  </td>
                  <Cell on={pref?.showGuestNames ?? true} />
                  <Cell on={pref?.showGuestCountry ?? true} />
                  <Cell on={pref?.showChannelLabels ?? true} />
                  <Cell on={pref?.showMaintenanceDetails ?? true} />
                  <td className="text-xs capitalize">
                    {pref?.calendarDensity ?? "comfortable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
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
    <td>
      <HandoffBadge tone={on ? "ok" : "soft"}>
        {on ? "shown" : "hidden"}
      </HandoffBadge>
    </td>
  );
}
