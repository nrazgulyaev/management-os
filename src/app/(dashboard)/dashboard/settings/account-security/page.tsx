import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardKpi, NoItemsYet } from "@/components/ui/primitives";
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
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[
            { label: "Settings", href: "/dashboard/settings" },
            { label: "Account security" },
          ]}
          title="Account security"
          description="Sign in to manage your password, two-factor authentication, sessions, and security audit log."
        />
        <NoItemsYet
          entityLabel="account security details"
          description="No signed-in user. Sign in to view this page."
        />
      </div>
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

  const mfaKpiStatus: "good" | "warn" | "bad" = mfa.verified
    ? "good"
    : mfa.pendingEnrolment
      ? "warn"
      : "bad";

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Account security" },
        ]}
        title="Account security"
        description={`Personal security center for ${me.email}. Org-wide MFA + login monitoring lives at /dashboard/security (admin only).`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/dashboard/settings">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Settings
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpi
          label="MFA"
          value={mfa.verified ? "On" : mfa.pendingEnrolment ? "Pending" : "Off"}
          status={mfaKpiStatus}
          hint={
            mfa.verified
              ? "TOTP factor verified"
              : "Enrol an authenticator below"
          }
        />
        <DashboardKpi
          label="Recovery codes"
          value={String(mfa.activeRecoveryCodeCount)}
          status={
            mfa.activeRecoveryCodeCount === 0
              ? "neutral"
              : mfa.activeRecoveryCodeCount < 3
                ? "warn"
                : "good"
          }
          hint={`${mfa.usedRecoveryCodeCount} used so far`}
        />
        <DashboardKpi
          label="Failed logins · 30d"
          value={String(summary.failedAttemptsLast30Days)}
          status={summary.failedAttemptsLast30Days > 0 ? "warn" : "good"}
          hint={
            summary.lastFailedLoginAt
              ? `Last: ${formatDate(summary.lastFailedLoginAt)}`
              : "None recently"
          }
        />
        <DashboardKpi
          label="Last successful sign-in"
          value={formatDate(summary.lastSuccessfulLoginAt)}
          status="neutral"
          hint={
            summary.lastSuccessfulLoginAt
              ? formatDateTime(summary.lastSuccessfulLoginAt)
              : "—"
          }
        />
      </div>

      <Section
        eyebrow="Identity"
        title="Password"
        description="Change the password used to sign in to Arconique. Updates take effect immediately on every active session."
      >
        <ChangePasswordForm />
      </Section>

      <Section
        eyebrow="Two-factor"
        title="Authenticator app (TOTP)"
        description="Adds a 6-digit code from an authenticator app to every sign-in. Strongly recommended for all internal users."
      >
        {mfa.verified ? (
          <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge tone="success">enrolled</Badge>
              <span className="text-sm text-ink">
                MFA is active on your account.
              </span>
            </div>
            <p className="text-xs text-ink-tertiary leading-relaxed">
              Verified {formatDate(mfa.verifiedAt)}. Last used{" "}
              {formatDate(mfa.lastUsedAt)}. If you lose access to your
              authenticator, use one of your recovery codes when prompted.
            </p>
            {mfa.factorId && <DisableMfaButton factorId={mfa.factorId} />}
          </div>
        ) : mfa.pendingEnrolment ? (
          <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3">
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
          <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3">
            <p className="text-sm text-ink leading-relaxed">
              Set up an authenticator app (Google Authenticator, 1Password,
              Authy, etc.). After scanning the QR code we generate, you&apos;ll
              receive 10 single-use recovery codes — store them safely.
            </p>
            <StartEnrolmentButton />
          </div>
        )}
      </Section>

      <Section
        eyebrow="Sessions"
        title="Active sessions"
        description="Supabase Auth tracks every refresh-token. We can&apos;t list other devices individually here, but you can sign them all out at once."
      >
        <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3">
          <div className="text-sm flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Badge tone="success">current</Badge>
              <span className="text-ink">This device</span>
            </div>
            <p className="text-xs text-ink-tertiary">
              Signed in as <span className="text-ink">{me.email}</span>.
              {sessionCreatedAt &&
                ` This session started ${formatDateTime(sessionCreatedAt)}.`}
            </p>
          </div>
          <SignOutOtherSessionsButton />
        </div>
      </Section>

      <Section
        eyebrow="Audit"
        title="Recent sign-in attempts"
        description="The last 20 sign-in attempts on your account. IP addresses are stored hashed."
      >
        {attempts.length === 0 ? (
          <NoItemsYet
            entityLabel="sign-in attempts"
            description="No sign-in attempts have been recorded against your account yet."
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Result</th>
                  <th className="text-left px-3 py-2">Reason / lock</th>
                  <th className="text-left px-3 py-2">IP fingerprint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 text-ink-secondary tabular-nums">
                      {formatDateTime(a.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={a.succeeded ? "success" : "warning"}>
                        {a.succeeded ? "succeeded" : "failed"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-secondary">
                      {a.lockedUntil ? (
                        <span className="inline-flex items-center gap-1 text-danger">
                          <AlertTriangle className="w-3 h-3" />
                          locked until {formatDateTime(a.lockedUntil)}
                        </span>
                      ) : (
                        (a.failureReason ?? (
                          <span className="text-ink-tertiary">—</span>
                        ))
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-tertiary">
                      {a.ipHash ? a.ipHash.slice(0, 12) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        eyebrow="Audit"
        title="Recent security events"
        description="MFA enrolment, password changes, session revokes, and suspicious-request flags. Last 20 events for your account."
      >
        {events.length === 0 ? (
          <NoItemsYet
            entityLabel="security events"
            description="No security events have been recorded for your account yet."
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Event</th>
                  <th className="text-left px-3 py-2">Severity</th>
                  <th className="text-left px-3 py-2">IP fingerprint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 text-ink-secondary tabular-nums">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {eventTypeLabel(e.eventType as SecurityEventType)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        tone={severityTone(
                          e.severity as SecurityEventSeverity,
                        )}
                      >
                        {e.severity}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-tertiary">
                      {e.ipHash ? e.ipHash.slice(0, 12) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="text-xs text-ink-tertiary">
        Suspect a compromised account? Sign out other sessions, rotate your
        password, and message your workspace admin to review the org-wide
        security event log.
      </p>
    </div>
  );
}
