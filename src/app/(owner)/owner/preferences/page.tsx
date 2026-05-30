import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { getDb } from "@/lib/db/client";
import { owners } from "@/lib/db/schema/ownership";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getOwnerNotificationPrefs } from "@/features/owner-portal/notification-prefs";
import { DEFAULT_NOTIFICATION_PREFS } from "@/features/owner-portal/notification-prefs-types";
import { NotificationPrefsForm } from "@/components/owner/notification-prefs-form";
import { OwnerProfileForm } from "@/components/owner/profile-form";

/**
 * Owner preferences hub — profile + notifications (PR4 owner-write-wave-1).
 * Calendar prefs keep their own page at /owner/preferences/calendar.
 * Payout editing is intentionally NOT here (2FA-gated; flagged for a
 * separate product decision).
 */

export const metadata = { title: "Preferences" };
export const dynamic = "force-dynamic";

export default async function OwnerPreferencesPage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const db = getDb();
  const [profileRow] = db
    ? await db
        .select({
          displayName: owners.displayName,
          email: owners.email,
          phone: owners.phone,
        })
        .from(owners)
        .where(eq(owners.id, owner.ownerId))
        .limit(1)
    : [];

  const prefs = await getOwnerNotificationPrefs(owner.ownerId).catch(
    () => DEFAULT_NOTIFICATION_PREFS,
  );

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Preferences"
        title="Your preferences"
        subtitle="Manage your profile and how Arconique notifies you. Calendar display options live under Calendar preferences."
        actions={
          <Link
            href="/owner/preferences/calendar"
            className="text-sm text-ink-secondary hover:text-terra"
          >
            Calendar preferences →
          </Link>
        }
      />

      {owner.isImpersonating && (
        <Card style={{ padding: "12px 16px" }}>
          <p className="text-xs text-ink-secondary m-0">
            You&apos;re viewing as this owner (read-only). Saving is disabled
            while impersonating.
          </p>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <div className="label">Profile</div>
          <h2 className="display" style={{ fontSize: 22, marginTop: 6, fontWeight: 500 }}>
            Your details
          </h2>
        </div>
        <Card style={{ padding: 20 }}>
          <OwnerProfileForm
            initial={{
              displayName: profileRow?.displayName ?? owner.ownerName,
              email: profileRow?.email ?? owner.ownerEmail ?? "",
              phone: profileRow?.phone ?? "",
            }}
          />
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <div className="label">Notifications</div>
          <h2 className="display" style={{ fontSize: 22, marginTop: 6, fontWeight: 500 }}>
            What we email you
          </h2>
        </div>
        <Card style={{ padding: 20 }}>
          <NotificationPrefsForm initial={prefs} />
        </Card>
      </section>
    </div>
  );
}
