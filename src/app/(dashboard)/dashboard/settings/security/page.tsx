import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getMfaStatus } from "@/features/security-baseline/mfa-services";
import {
  DisableMfaButton,
  StartEnrolmentButton,
} from "@/components/security/mfa-buttons";

export const metadata = { title: "Account security" };
export const dynamic = "force-dynamic";

export default async function AccountSecuritySettingsPage() {
  const me = await getCurrentAppUser();
  if (!me) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[
            { label: "Settings", href: "/dashboard/settings" },
            { label: "Security" },
          ]}
          title="Account security"
          description="Sign in to manage your account security."
        />
      </div>
    );
  }
  const status = await getMfaStatus(me.id);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Security" },
        ]}
        title="Account security"
        description="Manage your two-factor authentication and recovery codes."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="MFA"
          value={status.verified ? "On" : status.pendingEnrolment ? "Pending" : "Off"}
        />
        <MetricCard
          label="Active recovery codes"
          value={String(status.activeRecoveryCodeCount)}
        />
        <MetricCard
          label="Used recovery codes"
          value={String(status.usedRecoveryCodeCount)}
        />
        <MetricCard
          label="Last MFA use"
          value={
            status.lastUsedAt
              ? status.lastUsedAt.slice(0, 10)
              : "—"
          }
        />
      </div>
      <Section eyebrow="Two-factor" title="TOTP authenticator">
        {status.verified ? (
          <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge tone="success">enrolled</Badge>
              <span className="text-sm text-ink">
                MFA is active on your account.
              </span>
            </div>
            <p className="text-xs text-ink-tertiary leading-relaxed">
              Verified{" "}
              {status.verifiedAt
                ? new Date(status.verifiedAt).toISOString().slice(0, 10)
                : "—"}
              . If you lose access to your authenticator, use one of your
              recovery codes.
            </p>
            {status.factorId && <DisableMfaButton factorId={status.factorId} />}
          </div>
        ) : status.pendingEnrolment ? (
          <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge tone="info">pending</Badge>
              <span className="text-sm text-ink">
                Enrolment started — verify a code from your authenticator.
              </span>
            </div>
            <Link
              href="/setup/mfa/verify"
              className="text-xs text-ink hover:underline underline-offset-4"
            >
              Continue verification →
            </Link>
            {status.factorId && <DisableMfaButton factorId={status.factorId} />}
          </div>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3">
            <p className="text-sm text-ink leading-relaxed">
              Set up an authenticator app (Google Authenticator, 1Password,
              Authy, etc.) to add a second factor to your sign-in.  We will
              show a one-time secret + 10 recovery codes after enrolment.
            </p>
            <StartEnrolmentButton />
          </div>
        )}
      </Section>
      <p className="text-xs text-ink-tertiary">
        Login attempts and security events for your account are visible to
        super_admin / director. You can ask them to revoke a lost factor or
        rotate your recovery codes.
      </p>
    </div>
  );
}
