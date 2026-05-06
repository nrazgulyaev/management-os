import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getMfaStatus } from "@/features/security-baseline/mfa-services";
import { StartEnrolmentButton } from "@/components/security/mfa-buttons";

export const metadata = { title: "Enrol MFA" };
export const dynamic = "force-dynamic";

export default async function MfaEnrolmentPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login?next=/setup/mfa");
  const status = await getMfaStatus(me.id);
  return (
    <div className="max-w-xl mx-auto py-12 px-6 flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Setup" }, { label: "MFA" }]}
        title="Set up two-factor authentication"
        description="Adds a six-digit code from your authenticator app on top of your password. Strongly recommended for internal users."
      />
      {status.verified ? (
        <Section eyebrow="MFA" title="Already enrolled">
          <div className="flex items-center gap-2">
            <Badge tone="success">on</Badge>
            <span className="text-sm text-ink">
              Two-factor is already active on your account.
            </span>
          </div>
          <Link
            href="/dashboard/settings/security"
            className="text-xs text-ink hover:underline underline-offset-4"
          >
            Open account security →
          </Link>
        </Section>
      ) : status.pendingEnrolment ? (
        <Section eyebrow="MFA" title="Enrolment pending">
          <p className="text-sm text-ink-secondary">
            You started enrolment but did not finish verification. Continue
            below — or restart from scratch.
          </p>
          <Link
            href="/setup/mfa/verify"
            className="inline-flex items-center justify-center h-10 px-5 rounded-full bg-ink text-ink-inverse text-sm font-medium self-start"
          >
            Continue to verify
          </Link>
          <StartEnrolmentButton />
        </Section>
      ) : (
        <Section eyebrow="Step 1" title="Generate a new TOTP secret">
          <ol className="list-decimal list-inside text-sm text-ink-secondary leading-relaxed space-y-2">
            <li>Click the button below to generate a TOTP secret.</li>
            <li>
              Scan the otpauth URL (or enter the secret manually) into Google
              Authenticator, 1Password, Authy, or your preferred authenticator
              app.
            </li>
            <li>Click <em>Continue to verify</em> and enter a 6-digit code.</li>
            <li>
              You will then see 10 recovery codes — store them somewhere safe.
              Each can be used exactly once if you lose your authenticator.
            </li>
          </ol>
          <StartEnrolmentButton />
        </Section>
      )}
    </div>
  );
}
