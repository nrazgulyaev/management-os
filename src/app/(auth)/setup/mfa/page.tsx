import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
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
      <SectionHeading
        eyebrow="Setup · MFA"
        title="Set up two-factor authentication"
        subtitle="Adds a six-digit code from your authenticator app on top of your password. Strongly recommended for internal users."
      />
      {status.verified ? (
        <Card style={{ padding: 20 }}>
          <div className="label">MFA</div>
          <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
            Already enrolled
          </h2>
          <div className="flex items-center gap-2 mb-3">
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
        </Card>
      ) : status.pendingEnrolment ? (
        <Card style={{ padding: 20 }}>
          <div className="label">MFA</div>
          <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
            Enrolment pending
          </h2>
          <p className="text-sm text-ink-secondary mb-3">
            You started enrolment but did not finish verification. Continue
            below — or restart from scratch.
          </p>
          <Link
            href="/setup/mfa/verify"
            className="inline-flex items-center justify-center h-10 px-5 rounded-full bg-ink text-ink-inverse text-sm font-medium self-start mb-3"
          >
            Continue to verify
          </Link>
          <StartEnrolmentButton />
        </Card>
      ) : (
        <Card style={{ padding: 20 }}>
          <div className="label">Step 1</div>
          <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
            Generate a new TOTP secret
          </h2>
          <ol className="list-decimal list-inside text-sm text-ink-secondary leading-relaxed space-y-2 mb-4">
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
        </Card>
      )}
    </div>
  );
}
