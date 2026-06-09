import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getMyProfile } from "@/lib/investor-portal/queries";
import {
  updateMyPassword,
  updateMyReportingLanguage,
} from "@/lib/investor-portal/actions";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { Button } from "@/components/ui/button";
import {
  CURRENCY_LABEL,
  INVESTOR_TYPE_LABEL,
  LEGAL_ENTITY_LABEL,
  REPORTING_LANGUAGES,
  REPORTING_LANGUAGE_LABEL,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Profile · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function PortalProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const sp = await searchParams;
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);
  const profile = await getMyProfile();

  async function handleLanguage(formData: FormData) {
    "use server";
    const language = String(formData.get("language") ?? "en") as
      | "en"
      | "ru"
      | "id"
      | "zh";
    try {
      await updateMyReportingLanguage({ language });
      revalidatePath("/investor-portal/profile");
      redirect("/investor-portal/profile?success=Language%20updated");
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      redirect(`/investor-portal/profile?error=${encodeURIComponent(msg)}`);
    }
  }

  async function handlePassword(formData: FormData) {
    "use server";
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    if (newPassword !== confirm) {
      redirect("/investor-portal/profile?error=Passwords%20do%20not%20match");
    }
    try {
      await updateMyPassword({ newPassword });
      redirect("/investor-portal/profile?success=Password%20updated");
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      redirect(`/investor-portal/profile?error=${encodeURIComponent(msg)}`);
    }
  }

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle={strings.navProfile}
    >
      <div>
        <h1 className="font-display text-3xl text-ink">
          {strings.navProfile}
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          Read-only — contact your account manager to update legal details.
        </p>
      </div>

      <div className="rounded-lg border border-line-soft bg-surface p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <Field label="Investor code" value={profile.investorCode} mono />
        <Field label="Legal name" value={profile.legalName} />
        <Field
          label="Investor type"
          value={INVESTOR_TYPE_LABEL[profile.investorType]}
        />
        <Field
          label="Legal entity"
          value={
            profile.legalEntityType
              ? LEGAL_ENTITY_LABEL[
                  profile.legalEntityType as keyof typeof LEGAL_ENTITY_LABEL
                ]
              : "—"
          }
        />
        <Field
          label="Tax residency"
          value={profile.taxResidency ?? "—"}
        />
        <Field
          label="Primary currency"
          value={CURRENCY_LABEL[profile.primaryCurrency]}
        />
        <Field
          label="Reporting language"
          value={REPORTING_LANGUAGE_LABEL[profile.reportingLanguage]}
        />
        <Field label="Status" value={profile.status} />
        <Field label="Email" value={profile.contactEmail ?? "—"} mono />
        <Field label="Phone" value={profile.contactPhone ?? "—"} />
        {profile.contactName && (
          <Field label="Linked contact" value={profile.contactName} />
        )}
        <Field
          label="Onboarded"
          value={new Date(profile.onboardedAt).toLocaleDateString()}
        />
      </div>

      {sp.error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ink">
          {sp.error}
        </div>
      )}
      {sp.success && (
        <div className="rounded-md border border-success/40 bg-success-weak px-4 py-3 text-sm text-success">
          {sp.success}
        </div>
      )}

      <div className="rounded-lg border border-line-soft bg-surface p-6">
        <h3 className="text-ink font-medium mb-3 text-sm">
          Reporting language
        </h3>
        <form action={handleLanguage} className="flex items-center gap-2">
          <select
            name="language"
            defaultValue={profile.reportingLanguage}
            className="rounded-md border border-line-soft bg-surface px-2 py-1 text-sm text-ink"
          >
            {REPORTING_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {REPORTING_LANGUAGE_LABEL[l]}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
        <p className="text-xs text-ink-tertiary mt-2">
          The portal UI will re-render in the chosen language on next page load.
          Currency formatting follows your investor record.
        </p>
      </div>

      <div className="rounded-lg border border-line-soft bg-surface p-6">
        <h3 className="text-ink font-medium mb-3 text-sm">
          Change password
        </h3>
        <form action={handlePassword} className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
              New password
            </span>
            <input
              type="password"
              name="newPassword"
              required
              minLength={12}
              className="rounded-md border border-line-soft bg-surface px-2 py-1 text-sm text-ink"
              placeholder="≥12 chars, mixed case + number"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
              Confirm
            </span>
            <input
              type="password"
              name="confirm"
              required
              minLength={12}
              className="rounded-md border border-line-soft bg-surface px-2 py-1 text-sm text-ink"
            />
          </label>
          <div className="md:col-span-2">
            <Button type="submit" size="sm">
              Update password
            </Button>
          </div>
        </form>
        <p className="text-xs text-ink-tertiary mt-2">
          Routed through Supabase Auth — your session must be valid. Other
          legal-detail changes (name, currency, contact info) require contact
          with your Arconique account manager.
        </p>
      </div>
    </PortalShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      <span
        className={`text-ink ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
