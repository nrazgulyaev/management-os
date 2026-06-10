import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Kpi } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/settings">Settings</Link> /{" "}
            <span>Security</span>
          </div>
          <h1>Account security</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Sign in to manage your account security.
          </p>
        </div>
      </div>
    );
  }
  const status = await getMfaStatus(me.id);
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/settings">Settings</Link> /{" "}
            <span>Security</span>
          </div>
          <h1>Account security</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Manage your two-factor authentication and recovery codes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="MFA"
          value={
            status.verified ? "On" : status.pendingEnrolment ? "Pending" : "Off"
          }
          tone={
            status.verified
              ? "success"
              : status.pendingEnrolment
                ? "warn"
                : "danger"
          }
        />
        <Kpi
          label="Active recovery codes"
          value={String(status.activeRecoveryCodeCount)}
        />
        <Kpi
          label="Used recovery codes"
          value={String(status.usedRecoveryCodeCount)}
        />
        <Kpi
          label="Last MFA use"
          value={status.lastUsedAt ? status.lastUsedAt.slice(0, 10) : "—"}
        />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        TOTP authenticator
      </h2>
      {status.verified ? (
        <div className="card card-pad mb-[18px] flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge tone="success">enrolled</Badge>
            <span className="text-sm text-ink">
              MFA is active on your account.
            </span>
          </div>
          <p className="text-xs text-ink-3 leading-relaxed">
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
        <div className="card card-pad mb-[18px] flex flex-col gap-3">
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
        <div className="card card-pad mb-[18px] flex flex-col gap-3">
          <p className="text-sm text-ink leading-relaxed">
            Set up an authenticator app (Google Authenticator, 1Password,
            Authy, etc.) to add a second factor to your sign-in.  We will
            show a one-time secret + 10 recovery codes after enrolment.
          </p>
          <StartEnrolmentButton />
        </div>
      )}
      <p className="text-xs text-ink-3">
        Login attempts and security events for your account are visible to
        super_admin / director. You can ask them to revoke a lost factor or
        rotate your recovery codes.
      </p>
    </>
  );
}
