import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getOwnerSettings } from "@/features/owner-portal/get-settings";
import { getOwnerNotificationPrefs } from "@/features/owner-portal/notification-prefs";
import { DEFAULT_NOTIFICATION_PREFS } from "@/features/owner-portal/notification-prefs-types";
import { SectionHeading } from "@/components/dashboard/primitives";
import { SettingsSection } from "@/components/owner-portal/settings-section";
import { SettingsRow } from "@/components/owner-portal/settings-row";
import { OwnerNotificationToggles } from "@/components/owner-portal/owner-notification-toggles";

/**
 * Sprint OWNER-PORTAL · redesign owner-07 — Settings.
 *
 * Visual port of cc-handoff-bundle/cabinets/owner-p1/07-settings.html.
 * Wires the Phase 2.3 owner-07 primitives (SettingsSection / SettingsRow
 * / Toggle) to `getOwnerSettings` (profile / masked payout / 2FA) +
 * `getOwnerNotificationPrefs` (the live toggle state).
 *
 * Interactive: notification toggles persist via
 * updateOwnerNotificationPrefsAction (see OwnerNotificationToggles).
 *
 * Deferred per the prototype spec (flows not built — 2FA-gated):
 * profile inline edit, payout change/reveal, 2FA management. These read
 * as display rows here; the prototype routes each through a dedicated
 * flow (e.g. /owner/settings/payout/edit + owner-2fa).
 */

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function OwnerSettingsPage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const [settings, prefs] = await Promise.all([
    getOwnerSettings(owner.ownerId),
    getOwnerNotificationPrefs(owner.ownerId).catch(() => DEFAULT_NOTIFICATION_PREFS),
  ]);
  const readOnly = owner.isImpersonating;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading eyebrow="Your account" title="Settings" />

      {readOnly && (
        <p className="text-xs text-ink-secondary">
          You&rsquo;re viewing as this owner — changes are disabled while
          impersonating.
        </p>
      )}

      <SettingsSection
        title="Profile"
        helper="Your contact info — the team uses these for statements, alerts, and review scheduling."
      >
        <SettingsRow label="Full name" value={settings.profile.name} />
        <SettingsRow label="Email" value={settings.profile.email} />
        <SettingsRow label="Phone" value={settings.profile.phone} />
        <SettingsRow label="Language" value={settings.profile.language} />
      </SettingsSection>

      <SettingsSection
        title="Payout method"
        helper="Where your monthly statement payouts wire. Editing requires 2FA and email confirmation."
      >
        <SettingsRow
          label="Account"
          value={<span className="font-mono">{settings.payout.maskedAccount}</span>}
        />
        <SettingsRow label="Currency" value={settings.payout.currency} />
        {settings.payout.bankName && settings.payout.bankName !== "—" && (
          <SettingsRow label="Bank" value={settings.payout.bankName} />
        )}
        {settings.payout.lastUpdatedLabel && (
          <SettingsRow label="Last changed" value={settings.payout.lastUpdatedLabel} />
        )}
        <SettingsRow
          label="Wire schedule"
          value="1st of each month"
          action={
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-ink-tertiary">
              FIXED
            </span>
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        helper="When and how Arconique reaches out. SMS is for arrival alerts only."
      >
        <OwnerNotificationToggles initial={prefs} disabled={readOnly} />
      </SettingsSection>

      <SettingsSection
        title="Portal access"
        helper="Who can sign into this portal as you. Multi-user access is deferred to 2.5."
      >
        <SettingsRow
          label="Primary"
          value={`${settings.profile.email} · 2FA ${settings.twoFactorEnabled ? "via SMS" : "not enabled"}`}
          action={
            <button
              className="btn btn-secondary btn-sm opacity-60 cursor-not-allowed"
              disabled
              title="2FA management coming soon"
            >
              Manage 2FA
            </button>
          }
        />
        <SettingsRow
          label="Delegates"
          value="None · invite delegate available in 2.5"
        />
        <SettingsRow
          label="Calendar"
          value="Display options for your calendar"
          action={
            <Link href="/owner/preferences/calendar" className="btn btn-ghost btn-sm">
              Open →
            </Link>
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Leaving Arconique"
        tone="warn"
        helper="Off-boarding runs through your MSA termination clause — there's a 90-day grace period and a final statement. Speak with the Director first; it's always human-mediated, never self-service."
      >
        <div style={{ padding: "12px 0" }}>
          <Link href="/owner/inbox" className="btn btn-secondary btn-sm">
            Request termination call
          </Link>
        </div>
      </SettingsSection>
    </div>
  );
}
