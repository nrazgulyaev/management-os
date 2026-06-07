import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Database, ShieldCheck, KeyRound } from "lucide-react";
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

export default async function SettingsPage() {
  const ctx = await getCurrentUserContext();
  const bootstrap = isDbConfigured()
    ? await getBootstrapState()
    : { stage: "db_missing" as const };

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Settings</span>
          </div>
          <h1>Settings</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Tune the system to your house — workspace identity + configuration,
            session security, billing, and the audit trail.
          </p>
        </div>
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        Workspace configuration
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-[18px]">
        <Status
          icon={<Database className="w-4 h-4" />}
          label="Database"
          value={isDbConfigured() ? "Connected" : "Not configured"}
          tone={isDbConfigured() ? "success" : "warning"}
          hint={isDbConfigured() ? "Drizzle + Supabase Postgres." : "Set DATABASE_URL in .env.local."}
        />
        <Status
          icon={<KeyRound className="w-4 h-4" />}
          label="Supabase Auth"
          value={isSupabaseAuthConfigured() ? "Connected" : "Not configured"}
          tone={isSupabaseAuthConfigured() ? "success" : "warning"}
          hint={
            isSupabaseAuthConfigured()
              ? "Email + password sign-in active."
              : "Set NEXT_PUBLIC_SUPABASE_URL and ANON key."
          }
        />
        <Status
          icon={<ShieldCheck className="w-4 h-4" />}
          label="Service role"
          value={isSupabaseAdminConfigured() ? "Configured" : "Not configured"}
          tone={isSupabaseAdminConfigured() ? "success" : "neutral"}
          hint="Server-only. Used by privileged background jobs."
        />
        <Status
          icon={<ShieldCheck className="w-4 h-4" />}
          label="Bootstrap"
          value={
            bootstrap.stage === "needs_super_admin"
              ? "First super-admin not linked"
              : bootstrap.stage === "locked_requires_secret"
                ? "Locked (secret required)"
                : "Database not configured"
          }
          tone={
            bootstrap.stage === "locked_requires_secret"
              ? "success"
              : bootstrap.stage === "needs_super_admin"
                ? "warning"
                : "neutral"
          }
          hint="Manage at /setup/admin-bootstrap."
        />
        <Status
          icon={<KeyRound className="w-4 h-4" />}
          label="Demo mode flag"
          value={isDemoMode() ? "Enabled" : "Disabled"}
          tone={isDemoMode() ? "gold" : "neutral"}
          hint="NEXT_PUBLIC_ENABLE_DEMO_MODE controls demo banners."
        />
        <Status
          icon={<KeyRound className="w-4 h-4" />}
          label="Resolved mode"
          value={ctx.mode === "live" ? "Live" : "Demo"}
          tone={ctx.mode === "live" ? "success" : "gold"}
          hint={
            ctx.mode === "live"
              ? "Permission helpers enforce role checks."
              : "Permissive demo guards. Never use in production."
          }
        />
      </div>

      <h2 className="display text-[22px] font-normal mt-8 mb-3.5">Current session</h2>
      <div className="card p-5 flex items-center justify-between gap-4 flex-wrap mb-[18px]">
        <div>
          {ctx.appUser ? (
            <>
              <div className="text-[14px] font-medium text-ink">{ctx.appUser.fullName}</div>
              <div className="text-[12px] text-ink-3">
                {ctx.appUser.email} · roles: {ctx.roles.join(", ") || "—"}
              </div>
            </>
          ) : (
            <>
              <div className="text-[14px] text-ink">Not signed in</div>
              <div className="text-[12px] text-ink-3">Use /login to sign in.</div>
            </>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {ctx.appUser && (
            <Button asChild>
              <Link href="/dashboard/settings/account-security">
                Account security
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href="/dashboard/settings/users">
              Manage users
              <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Link>
          </Button>
          {ctx.appUser && (
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          )}
        </div>
      </div>

      <h2 className="display text-[22px] font-normal mt-8 mb-3.5">Subscription</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-[18px]">
        <div className="card p-5 flex flex-col gap-3">
          <div>
            <h3 className="display-sm">Manage subscription</h3>
            <p className="text-[13px] text-ink-3 mt-1 leading-relaxed">
              Update your payment method, view invoices, change billing cycle, or
              cancel — all via Stripe&apos;s hosted portal.
            </p>
          </div>
          <Button asChild>
            <Link href="/api/billing/portal">Open Customer Portal →</Link>
          </Button>
        </div>
        <div className="card p-5 flex flex-col gap-3">
          <div>
            <h3 className="display-sm">Change plan</h3>
            <p className="text-[13px] text-ink-3 mt-1 leading-relaxed">
              Upgrade or switch plans. Changes take effect at the next billing
              cycle; pricing is prorated by Stripe.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/dashboard/billing/upgrade">View plans →</Link>
          </Button>
        </div>
      </div>

      <h2 className="display text-[22px] font-normal mt-8 mb-3.5">Audit</h2>
      <div className="card p-5 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-[13px] text-ink-3 leading-relaxed max-w-xl">
          Every meaningful mutation across projects, villas, owners, bookings,
          channels, guests, shares, and documents writes an entry to the audit
          log.
        </p>
        <Button asChild>
          <Link href="/dashboard/audit">Open audit log</Link>
        </Button>
      </div>
    </>
  );
}

function Status({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "success" | "warning" | "neutral" | "gold";
  hint?: string;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-md bg-muted text-ink-secondary inline-flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13.5px] text-ink">{label}</span>
          <Badge tone={tone}>{value}</Badge>
        </div>
        {hint && <p className="text-[11px] text-ink-4 mt-1 leading-relaxed">{hint}</p>}
      </div>
    </div>
  );
}
