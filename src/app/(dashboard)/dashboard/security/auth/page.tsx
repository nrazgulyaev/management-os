import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
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
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/security">Security</Link> /{" "}
            <span>Authentication</span>
          </div>
          <h1>Authentication security</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            MFA enrolment, login throttling, and security event log. Investor /
            owner / vendor / field roles cannot reach this page.
          </p>
        </div>
      </div>

      <div className="gs-kpis">
        <Kpi
          label="Failed logins · 24h"
          value={String(sum.failedLast24h)}
          tone={sum.failedLast24h > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Successful logins · 24h"
          value={String(sum.successfulLast24h)}
        />
        <Kpi
          label="Active locks"
          value={String(sum.activeLocks)}
          tone={sum.activeLocks > 0 ? "warn" : undefined}
        />
        <Kpi label="MFA verified users" value={String(verifiedFactors.length)} />
      </div>

      {!summary.ok && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs mb-[18px]">
          Migration pending — apply{" "}
          <code className="font-mono">
            0033_security_baseline_operational_hardening.sql
          </code>{" "}
          to enable login attempts + security events.
        </p>
      )}

      <div className="label mb-2.5">Manage · jump to</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <JumpCard
          href="/dashboard/security/login-attempts"
          title="Login attempts"
          detail={`${sum.failedLast24h} failed · ${sum.activeLocks} locked`}
        />
        <JumpCard
          href="/dashboard/security/events"
          title="Security events"
          detail="MFA, login locks, suspicious requests"
        />
        <JumpCard
          href="/dashboard/security/mfa"
          title="MFA factors"
          detail={`${verifiedFactors.length} verified · ${factors.value.length} total`}
        />
      </div>

      <p className="mt-[18px] text-[11px] text-ink-4 leading-relaxed max-w-[680px]">
        Sign-in is currently routed through Supabase Auth. Login throttling
        records every server-side attempt; full enforcement on the sign-in
        path completes when the auth callback proxies through a dedicated
        server action.
      </p>
    </>
  );
}

function JumpCard({
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
      className="card px-[18px] py-[14px] block hover:opacity-90"
    >
      <div className="text-[13.5px] text-ink">{title}</div>
      <div className="mono text-[11px] text-ink-4 mt-1">{detail}</div>
    </Link>
  );
}
