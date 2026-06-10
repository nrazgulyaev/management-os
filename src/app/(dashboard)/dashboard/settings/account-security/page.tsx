import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getCurrentAuthUser } from "@/lib/supabase/server";
import { getMfaStatus } from "@/features/security-baseline/mfa-services";
import {
  listMyLoginAttempts,
  listMySecurityEvents,
  summarizeMyAccountSecurity,
} from "@/features/auth/account-security-services";
import {
  eventTypeLabel,
  severityTone,
  type SecurityEventType,
  type SecurityEventSeverity,
} from "@/features/security-baseline/security-events-pure";
import {
  DisableMfaButton,
  StartEnrolmentButton,
} from "@/components/security/mfa-buttons";
import {
  ChangePasswordForm,
  SignOutOtherSessionsButton,
} from "@/components/settings/account-security-buttons";

export const metadata = { title: "Account security · Settings" };
export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

export default async function AccountSecurityPage() {
  const me = await getCurrentAppUser();

  if (!me) {
    return (
      <>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/dashboard/settings">Settings</Link> /{" "}
              <span>Account security</span>
            </div>
            <h1>Account security</h1>
            <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
              Sign in to manage your password, two-factor authentication,
              sessions, and security audit log.
            </p>
          </div>
        </div>
        <div className="card card-pad mt-[18px]">
          <p className="text-sm text-ink-3">
            No signed-in user. Sign in to view this page.
          </p>
        </div>
      </>
    );
  }

  const [auth, mfa, summary, attempts, events] = await Promise.all([
    getCurrentAuthUser(),
    getMfaStatus(me.id),
    summarizeMyAccountSecurity(me.id),
    listMyLoginAttempts(me.id, 20),
    listMySecurityEvents(me.id, 20),
  ]);

  const lastSignInAt =
    (auth?.last_sign_in_at as string | null | undefined) ?? null;
  const sessionCreatedAt = lastSignInAt;

  const mfaKpiTone: "success" | "warn" | "danger" = mfa.verified
    ? "success"
    : mfa.pendingEnrolment
      ? "warn"
      : "danger";

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/settings">Settings</Link> /{" "}
            <span>Account security</span>
          </div>
          <h1>Account security</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Personal security center for {me.email}. Org-wide MFA + login
            monitoring lives at /dashboard/security (admin only).
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/settings"
            className="btn btn-secondary btn-sm"
          >
            ← Settings
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="MFA"
          value={mfa.verified ? "On" : mfa.pendingEnrolment ? "Pending" : "Off"}
          tone={mfaKpiTone}
          sub={
            mfa.verified
              ? "TOTP factor verified"
              : "Enrol an authenticator below"
          }
        />
        <Kpi
          label="Recovery codes"
          value={String(mfa.activeRecoveryCodeCount)}
          tone={
            mfa.activeRecoveryCodeCount === 0
              ? undefined
              : mfa.activeRecoveryCodeCount < 3
                ? "warn"
                : "success"
          }
          sub={`${mfa.usedRecoveryCodeCount} used so far`}
        />
        <Kpi
          label="Failed logins · 30d"
          value={String(summary.failedAttemptsLast30Days)}
          tone={summary.failedAttemptsLast30Days > 0 ? "warn" : "success"}
          sub={
            summary.lastFailedLoginAt
              ? `Last: ${formatDate(summary.lastFailedLoginAt)}`
              : "None recently"
          }
        />
        <Kpi
          label="Last successful sign-in"
          value={formatDate(summary.lastSuccessfulLoginAt)}
          sub={
            summary.lastSuccessfulLoginAt
              ? formatDateTime(summary.lastSuccessfulLoginAt)
              : "—"
          }
        />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        Password
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5">
        Change the password used to sign in to Arconique. Updates take effect
        immediately on every active session.
      </p>
      <div className="card card-pad mb-[18px]">
        <ChangePasswordForm />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        Authenticator app (TOTP)
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5">
        Adds a 6-digit code from an authenticator app to every sign-in.
        Strongly recommended for all internal users.
      </p>
      {mfa.verified ? (
        <div className="card card-pad mb-[18px] flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge tone="success">enrolled</Badge>
            <span className="text-sm text-ink">
              MFA is active on your account.
            </span>
          </div>
          <p className="text-xs text-ink-3 leading-relaxed">
            Verified {formatDate(mfa.verifiedAt)}. Last used{" "}
            {formatDate(mfa.lastUsedAt)}. If you lose access to your
            authenticator, use one of your recovery codes when prompted.
          </p>
          {mfa.factorId && <DisableMfaButton factorId={mfa.factorId} />}
        </div>
      ) : mfa.pendingEnrolment ? (
        <div className="card card-pad mb-[18px] flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge tone="info">pending</Badge>
            <span className="text-sm text-ink">
              Enrolment started — verify a code from your authenticator to
              finish.
            </span>
          </div>
          <Link
            href="/setup/mfa/verify"
            className="text-xs text-ink hover:underline underline-offset-4"
          >
            Continue verification →
          </Link>
          {mfa.factorId && <DisableMfaButton factorId={mfa.factorId} />}
        </div>
      ) : (
        <div className="card card-pad mb-[18px] flex flex-col gap-3">
          <p className="text-sm text-ink leading-relaxed">
            Set up an authenticator app (Google Authenticator, 1Password,
            Authy, etc.). After scanning the QR code we generate, you&apos;ll
            receive 10 single-use recovery codes — store them safely.
          </p>
          <StartEnrolmentButton />
        </div>
      )}

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        Active sessions
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5">
        Supabase Auth tracks every refresh-token. We can&apos;t list other
        devices individually here, but you can sign them all out at once.
      </p>
      <div className="card card-pad mb-[18px] flex flex-col gap-3">
        <div className="text-sm flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge tone="success">current</Badge>
            <span className="text-ink">This device</span>
          </div>
          <p className="text-xs text-ink-3">
            Signed in as <span className="text-ink">{me.email}</span>.
            {sessionCreatedAt &&
              ` This session started ${formatDateTime(sessionCreatedAt)}.`}
          </p>
        </div>
        <SignOutOtherSessionsButton />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        Recent sign-in attempts
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5">
        The last 20 sign-in attempts on your account. IP addresses are stored
        hashed.
      </p>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Result</th>
              <th scope="col">Reason / lock</th>
              <th scope="col">IP fingerprint</th>
            </tr>
          </thead>
          <tbody>
            {attempts.length === 0 ? (
              <TableEmpty colSpan={4}>
                No sign-in attempts have been recorded against your account
                yet.
              </TableEmpty>
            ) : (
              attempts.map((a) => (
                <tr key={a.id}>
                  <td className="tabular-nums">
                    {formatDateTime(a.createdAt)}
                  </td>
                  <td>
                    <Badge tone={a.succeeded ? "success" : "warning"}>
                      {a.succeeded ? "succeeded" : "failed"}
                    </Badge>
                  </td>
                  <td className="text-xs">
                    {a.lockedUntil ? (
                      <span className="inline-flex items-center gap-1 text-danger">
                        <AlertTriangle className="w-3 h-3" />
                        locked until {formatDateTime(a.lockedUntil)}
                      </span>
                    ) : (
                      (a.failureReason ?? <span className="text-ink-3">—</span>)
                    )}
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {a.ipHash ? a.ipHash.slice(0, 12) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        Recent security events
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5">
        MFA enrolment, password changes, session revokes, and
        suspicious-request flags. Last 20 events for your account.
      </p>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Event</th>
              <th scope="col">Severity</th>
              <th scope="col">IP fingerprint</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <TableEmpty colSpan={4}>
                No security events have been recorded for your account yet.
              </TableEmpty>
            ) : (
              events.map((e) => (
                <tr key={e.id}>
                  <td className="tabular-nums">
                    {formatDateTime(e.createdAt)}
                  </td>
                  <td className="text-ink">
                    {eventTypeLabel(e.eventType as SecurityEventType)}
                  </td>
                  <td>
                    <Badge
                      tone={severityTone(
                        e.severity as SecurityEventSeverity,
                      )}
                    >
                      {e.severity}
                    </Badge>
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {e.ipHash ? e.ipHash.slice(0, 12) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-3">
        Suspect a compromised account? Sign out other sessions, rotate your
        password, and message your workspace admin to review the org-wide
        security event log.
      </p>
    </>
  );
}
