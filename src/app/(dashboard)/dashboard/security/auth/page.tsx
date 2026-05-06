import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { listMfaFactorsForAdmin } from "@/features/security-baseline/mfa-services";
import { summariseRecentLoginAttempts } from "@/features/security-baseline/login-throttle";
import { safeCount, safeList } from "@/features/system/db-health";

export const metadata = { title: "Authentication security" };
export const dynamic = "force-dynamic";

export default async function AuthSecurityHubPage() {
  const summary = await safeCount("auth.summary", async () => {
    const s = await summariseRecentLoginAttempts();
    return s.failedLast24h + s.successfulLast24h;
  });
  const recent = await safeList("auth.summary.recent", async () =>
    [await summariseRecentLoginAttempts()],
  );
  const factors = await safeList("auth.factors", async () =>
    listMfaFactorsForAdmin(),
  );
  const verifiedFactors = (factors.value ?? []).filter(
    (f) => f.status === "verified",
  );
  const sum = recent.value[0] ?? {
    failedLast24h: 0,
    successfulLast24h: 0,
    activeLocks: 0,
  };
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Security", href: "/dashboard/security" },
          { label: "Authentication" },
        ]}
        title="Authentication security"
        description="MFA enrolment, login throttling, and security event log. Investor / owner / vendor / field roles cannot reach this page."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Failed logins · 24h"
          value={String(sum.failedLast24h)}
          accent={sum.failedLast24h > 0}
        />
        <MetricCard
          label="Successful logins · 24h"
          value={String(sum.successfulLast24h)}
        />
        <MetricCard
          label="Active locks"
          value={String(sum.activeLocks)}
          accent={sum.activeLocks > 0}
        />
        <MetricCard
          label="MFA verified users"
          value={String(verifiedFactors.length)}
        />
      </div>
      {!summary.ok && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs">
          Migration pending — apply{" "}
          <code className="font-mono">
            0033_security_baseline_operational_hardening.sql
          </code>{" "}
          to enable login attempts + security events.
        </p>
      )}
      <Section eyebrow="Manage" title="Jump to">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card
            href="/dashboard/security/login-attempts"
            title="Login attempts"
            detail={`${sum.failedLast24h} failed · ${sum.activeLocks} locked`}
          />
          <Card
            href="/dashboard/security/events"
            title="Security events"
            detail="MFA, login locks, suspicious requests"
          />
          <Card
            href="/dashboard/security/mfa"
            title="MFA factors"
            detail={`${verifiedFactors.length} verified · ${factors.value.length} total`}
          />
        </div>
      </Section>
      <p className="text-xs text-ink-tertiary">
        Sign-in is currently routed through Supabase Auth. Login throttling
        records every server-side attempt; full enforcement on the sign-in
        path completes when the auth callback proxies through a dedicated
        server action.
      </p>
    </div>
  );
}

function Card({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-line-soft bg-surface p-4 hover:border-line-strong"
    >
      <div className="text-sm text-ink font-medium">{title}</div>
      <div className="text-xs text-ink-tertiary mt-1">{detail}</div>
    </Link>
  );
}
