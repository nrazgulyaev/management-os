import Link from "next/link";
import { headers } from "next/headers";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, AlertTriangle, KeyRound } from "lucide-react";
import { isDbConfigured, isSupabaseAuthConfigured } from "@/lib/env";
import { getBootstrapState } from "@/features/auth/bootstrap";
import { getCurrentAuthUser } from "@/lib/supabase/server";
import { BootstrapForm } from "./form";

export const metadata = { title: "Admin bootstrap" };
// Always render server-side — bootstrap state must reflect the live DB.
export const dynamic = "force-dynamic";

export default async function AdminBootstrapPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; first?: string }>;
}) {
  const sp = await searchParams;
  const dbReady = isDbConfigured();
  const authReady = isSupabaseAuthConfigured();
  const state = dbReady ? await getBootstrapState() : { stage: "db_missing" as const };
  const auth = authReady ? await getCurrentAuthUser() : null;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent") ?? null;

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="px-6 md:px-10 py-6 border-b border-line-soft">
        <Logo />
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl space-y-8">
          <div>
            <Badge tone="gold">Setup</Badge>
            <h1 className="text-display text-[36px] leading-[1.05] font-medium text-ink mt-4">
              Admin bootstrap
            </h1>
            <p className="text-ink-secondary mt-3 leading-relaxed">
              Link a Supabase Auth user to an internal <code className="font-mono text-xs">app_users</code>{" "}
              record and grant the <code className="font-mono text-xs">super_admin</code> role.
              The first run is open while no super-admin exists; subsequent
              runs require <code className="font-mono text-xs">ADMIN_BOOTSTRAP_SECRET</code>.
            </p>
          </div>

          {sp.ok === "1" && (
            <Notice tone="success" icon={<ShieldCheck className="w-4 h-4" />} title="Bootstrap complete">
              {sp.first === "1"
                ? "First super-admin linked. The bootstrap route is now locked behind ADMIN_BOOTSTRAP_SECRET."
                : "Super-admin role linked successfully."}
              <div className="mt-3">
                <Button asChild size="sm">
                  <Link href="/dashboard">Open dashboard →</Link>
                </Button>
              </div>
            </Notice>
          )}

          {state.stage === "db_missing" && (
            <Notice tone="warning" icon={<AlertTriangle className="w-4 h-4" />} title="Database not configured">
              The platform database is not reachable. Verify your deploy
              configuration and rerun the bootstrap step once the database
              is online.
            </Notice>
          )}

          {state.stage !== "db_missing" && !authReady && (
            <Notice tone="warning" icon={<AlertTriangle className="w-4 h-4" />} title="Supabase Auth not configured">
              Add <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
              <code className="font-mono text-xs">.env.local</code> and reload.
            </Notice>
          )}

          {state.stage !== "db_missing" && authReady && (
            <>
              <BootstrapStateCard state={state} hasSession={Boolean(auth)} />
              {!auth ? (
                <Notice tone="info" icon={<KeyRound className="w-4 h-4" />} title="Sign in first">
                  You need an active Supabase session to bootstrap. Create one
                  at <Link href="/login" className="underline">/login</Link>{" "}
                  (or sign up directly via your Supabase dashboard) and return here.
                </Notice>
              ) : (
                <BootstrapForm
                  authUserId={auth.id}
                  email={auth.email ?? ""}
                  defaultName={String((auth.user_metadata as Record<string, unknown> | null | undefined)?.full_name ?? auth.email ?? "")}
                  state={state}
                  ipAddress={ip}
                  userAgent={userAgent}
                />
              )}
            </>
          )}

          <div className="border-t border-line-soft pt-6">
            <p className="text-xs text-ink-tertiary leading-relaxed">
              Bootstrap actions are append-logged to{" "}
              <code className="font-mono">audit_events</code>. The service-role
              key is never used here — every operation runs as the requesting
              user against Drizzle.
            </p>
            <div className="mt-3 flex gap-3 text-xs">
              <Link href="/login" className="underline text-ink hover:text-accent">
                Login
              </Link>
              <Link href="/dashboard" className="underline text-ink hover:text-accent">
                Dashboard
              </Link>
              <Link href="/" className="underline text-ink hover:text-accent">
                Home
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Notice({
  tone,
  icon,
  title,
  children,
}: {
  tone: "success" | "warning" | "info";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-success/30 bg-success-weak/40"
      : tone === "warning"
        ? "border-warning/30 bg-warning-weak/40"
        : "border-info/30 bg-info-weak/40";
  const iconCls =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-info";
  return (
    <div className={`rounded-md border ${cls} p-4`}>
      <div className="flex items-center gap-2">
        <span className={iconCls}>{icon}</span>
        <span className="text-sm font-medium text-ink">{title}</span>
      </div>
      <div className="text-sm text-ink-secondary mt-2 leading-relaxed">{children}</div>
    </div>
  );
}

function BootstrapStateCard({
  state,
  hasSession,
}: {
  state: { stage: string };
  hasSession: boolean;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-md bg-muted text-ink-secondary inline-flex items-center justify-center">
        <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-ink">
          {state.stage === "needs_super_admin"
            ? "First super-admin not yet linked"
            : "Super-admin already exists"}
        </div>
        <div className="text-xs text-ink-tertiary mt-0.5">
          {state.stage === "needs_super_admin"
            ? "First link is open — anyone signed in can claim it. Lock down by completing this step."
            : "ADMIN_BOOTSTRAP_SECRET is required to grant additional super-admin roles."}
        </div>
      </div>
      {hasSession ? (
        <Badge tone="success">Signed in</Badge>
      ) : (
        <Badge tone="warning">No session</Badge>
      )}
    </div>
  );
}
