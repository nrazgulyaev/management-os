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
      <div className="flex flex-col gap-5">
        {/* Page header — mono eyebrow + Space Grotesk display title */}
        <header>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-4">
            Account
          </div>
          <h1 className="mt-1.5 font-display text-[29px] font-medium leading-none tracking-[-0.02em] text-ink">
            {strings.navProfile}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-3">
            Read-only — contact your account manager to update legal details.
          </p>
        </header>

        {sp.error && (
          <div className="rounded-[10px] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ink">
            {sp.error}
          </div>
        )}
        {sp.success && (
          <div className="rounded-[10px] border border-success/40 bg-success-weak px-4 py-3 text-sm text-success">
            {sp.success}
          </div>
        )}

        {/* Identity card */}
        <section className="rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
              Investor record
            </h3>
            <span className="rounded-full border border-line-strong bg-canvas px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
              {profile.status}
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
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
            <Field label="Tax residency" value={profile.taxResidency ?? "—"} />
            <Field
              label="Primary currency"
              value={CURRENCY_LABEL[profile.primaryCurrency]}
            />
            <Field
              label="Reporting language"
              value={REPORTING_LANGUAGE_LABEL[profile.reportingLanguage]}
            />
            <Field label="Email" value={profile.contactEmail ?? "—"} mono />
            <Field label="Phone" value={profile.contactPhone ?? "—"} />
            {profile.contactName && (
              <Field label="Linked contact" value={profile.contactName} />
            )}
            <Field
              label="Onboarded"
              value={new Date(profile.onboardedAt).toLocaleDateString()}
            />
          </dl>
        </section>

        {/* Reporting language */}
        <section className="rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card">
          <h3 className="mb-3 font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
            Reporting language
          </h3>
          <form action={handleLanguage} className="flex items-center gap-2">
            <select
              name="language"
              defaultValue={profile.reportingLanguage}
              className="rounded-[8px] border border-line-strong bg-canvas px-3 py-2 text-sm text-ink focus:border-amber focus:outline-none"
            >
              {REPORTING_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {REPORTING_LANGUAGE_LABEL[l]}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-amber btn-sm">
              Save
            </button>
          </form>
          <p className="mt-2.5 text-xs text-ink-tertiary">
            The portal UI will re-render in the chosen language on next page
            load. Currency formatting follows your investor record.
          </p>
        </section>

        {/* Change password */}
        <section className="rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card">
          <h3 className="mb-3 font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
            Change password
          </h3>
          <form
            action={handlePassword}
            className="grid max-w-2xl grid-cols-1 gap-3 md:grid-cols-2"
          >
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
                New password
              </span>
              <input
                type="password"
                name="newPassword"
                required
                minLength={12}
                className="rounded-[8px] border border-line-strong bg-canvas px-3 py-2 text-sm text-ink focus:border-amber focus:outline-none"
                placeholder="≥12 chars, mixed case + number"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
                Confirm
              </span>
              <input
                type="password"
                name="confirm"
                required
                minLength={12}
                className="rounded-[8px] border border-line-strong bg-canvas px-3 py-2 text-sm text-ink focus:border-amber focus:outline-none"
              />
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="btn btn-amber btn-sm">
                Update password
              </button>
            </div>
          </form>
          <p className="mt-2.5 text-xs text-ink-tertiary">
            Routed through Supabase Auth — your session must be valid. Other
            legal-detail changes (name, currency, contact info) require contact
            with your Arconique account manager.
          </p>
        </section>
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
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
        {label}
      </dt>
      <dd className={`text-[13.5px] text-ink ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
