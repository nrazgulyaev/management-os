import Link from "next/link";
import { Database, ShieldCheck, KeyRound, ToggleRight } from "lucide-react";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { getBootstrapState } from "@/features/auth/bootstrap";
import {
  isDbConfigured,
  isSupabaseAuthConfigured,
  isSupabaseAdminConfigured,
  isDemoMode,
} from "@/lib/env";
import { signOutAction } from "@/features/auth/actions";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function initials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

export default async function SettingsPage() {
  const ctx = await getCurrentUserContext();
  const bootstrap = isDbConfigured()
    ? await getBootstrapState()
    : { stage: "db_missing" as const };

  const dbOn = isDbConfigured();
  const authOn = isSupabaseAuthConfigured();
  const adminOn = isSupabaseAdminConfigured();
  const live = ctx.mode === "live";

  const cfg: Array<{
    icon: React.ReactNode;
    label: string;
    value: string;
    badge: string;
    hint: string;
  }> = [
    {
      icon: <Database className="w-4 h-4" strokeWidth={1.7} />,
      label: "Database",
      value: dbOn ? "Connected" : "Not configured",
      badge: dbOn ? "badge-ok" : "badge-warn",
      hint: dbOn
        ? "Drizzle + Supabase Postgres."
        : "Set DATABASE_URL in .env.local.",
    },
    {
      icon: <KeyRound className="w-4 h-4" strokeWidth={1.7} />,
      label: "Supabase Auth",
      value: authOn ? "Connected" : "Not configured",
      badge: authOn ? "badge-ok" : "badge-warn",
      hint: authOn
        ? "Email + password sign-in active · MFA enrolment on."
        : "Set NEXT_PUBLIC_SUPABASE_URL and ANON key.",
    },
    {
      icon: <ShieldCheck className="w-4 h-4" strokeWidth={1.7} />,
      label: "Service role",
      value: adminOn ? "Configured" : "Not configured",
      badge: adminOn ? "badge-ok" : "badge-soft",
      hint: "Server-only · privileged background jobs.",
    },
    {
      icon: <ToggleRight className="w-4 h-4" strokeWidth={1.7} />,
      label: "Resolved mode",
      value: live ? "Live" : "Demo",
      badge: live ? "badge-ok" : "badge-gold",
      hint: live
        ? "Permission helpers enforce role checks."
        : "Permissive demo guards. Never use in production.",
    },
    {
      icon: <ShieldCheck className="w-4 h-4" strokeWidth={1.7} />,
      label: "Bootstrap",
      value:
        bootstrap.stage === "needs_super_admin"
          ? "First super-admin not linked"
          : bootstrap.stage === "locked_requires_secret"
            ? "Locked (secret required)"
            : "Database not configured",
      badge:
        bootstrap.stage === "locked_requires_secret"
          ? "badge-ok"
          : bootstrap.stage === "needs_super_admin"
            ? "badge-warn"
            : "badge-soft",
      hint: "Manage at /setup/admin-bootstrap.",
    },
    {
      icon: <KeyRound className="w-4 h-4" strokeWidth={1.7} />,
      label: "Demo mode flag",
      value: isDemoMode() ? "Enabled" : "Disabled",
      badge: isDemoMode() ? "badge-gold" : "badge-soft",
      hint: "NEXT_PUBLIC_ENABLE_DEMO_MODE controls demo banners.",
    },
  ];

  return (
    <>
      <div className="section-heading">
        <div className="eyebrow label">System · configuration + identity</div>
        <h1>
          Workspace <em>settings</em>.
        </h1>
        <p>
          System configuration, identity, billing and operational health for the
          workspace — tune the system to your house.
        </p>
      </div>

      <div className="gs-card-h">
        <h3 className="!text-[16px]">Configuration &amp; health</h3>
        <span className="meta">ENV · {live ? "LIVE" : "DEMO"}</span>
      </div>
      <div className="gs-cfg mb-5">
        {cfg.map((c) => (
          <div key={c.label} className="c">
            <span className="ic">{c.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="nm">
                {c.label}
                <span className={`badge ${c.badge}`}>{c.value}</span>
              </span>
              <span className="hi">{c.hint}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="gs-2col">
        <div className="card card-pad">
          <div className="gs-card-h">
            <h3>Current session</h3>
          </div>
          <div className="flex items-center gap-[14px] pt-1.5 pb-4 border-b border-line-soft mb-3.5">
            <span className="avatar avatar-lg">
              {initials(ctx.appUser?.fullName)}
            </span>
            <div className="min-w-0">
              {ctx.appUser ? (
                <>
                  <div className="text-[15px] text-ink font-medium truncate">
                    {ctx.appUser.fullName}
                  </div>
                  <div className="mono text-[11px] text-ink-3 truncate">
                    {ctx.appUser.email} · {ctx.roles.join(", ") || "—"}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[15px] text-ink">Not signed in</div>
                  <div className="mono text-[11px] text-ink-3">
                    Use /login to sign in.
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {ctx.appUser && (
              <Link
                href="/dashboard/settings/account-security"
                className="btn btn-accent btn-sm"
              >
                Account security
              </Link>
            )}
            <Link
              href="/dashboard/settings/users"
              className="btn btn-secondary btn-sm"
            >
              Manage users
            </Link>
            {ctx.appUser && (
              <form action={signOutAction}>
                <button type="submit" className="btn btn-ghost btn-sm">
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="card card-pad">
          <div className="gs-card-h">
            <h3>Subscription</h3>
          </div>
          <div className="kpi gold mb-3">
            <div className="label">Plan</div>
            <div className="v !text-[20px]">Pro</div>
            <div className="sub">renews 1 Jul · Stripe</div>
          </div>
          <p className="text-[12px] text-ink-3 leading-relaxed mb-3">
            Update your payment method, view invoices, change billing cycle, or
            switch plans — all via Stripe&apos;s hosted portal. Changes are
            prorated at the next cycle.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Link href="/api/billing/portal" className="btn btn-secondary btn-sm">
              Customer portal
            </Link>
            <Link
              href="/dashboard/billing/upgrade"
              className="btn btn-ghost btn-sm"
            >
              Change plan
            </Link>
          </div>
        </div>
      </div>

      <div className="card card-pad mt-[18px] flex items-center justify-between gap-4 flex-wrap">
        <p className="text-[13px] text-ink-3 leading-relaxed max-w-xl">
          Every meaningful mutation across projects, villas, owners, bookings,
          channels, guests, shares and documents writes an entry to the audit
          log.
        </p>
        <Link href="/dashboard/audit" className="btn btn-secondary btn-sm">
          Open audit log →
        </Link>
      </div>
    </>
  );
}
