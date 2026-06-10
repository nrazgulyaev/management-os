import Link from "next/link";
import { headers } from "next/headers";
import { ShieldCheck, AlertTriangle, KeyRound } from "lucide-react";
import { AuthShell, AuthHead } from "@/components/auth/auth-shell";
import {
  resolveAuthPlatform,
  resolveTokenProduct,
} from "@/components/auth/auth-copy";
import { Badge } from "@/components/ui/badge";
import { isDbConfigured, isSupabaseAuthConfigured } from "@/lib/env";
import { getBootstrapState } from "@/features/auth/bootstrap";
import { getCurrentAuthUser } from "@/lib/supabase/server";
import { BootstrapForm } from "./form";

export const metadata = { title: "Admin bootstrap" };
// Always render server-side — bootstrap state must reflect the live DB.
export const dynamic = "force-dynamic";

/**
 * RESKIN-AUTH-3 — admin bootstrap rebuilt onto the shared <AuthShell>
 * brick (cc-functional-handoff/auth · Auth Suite.html, "Admin
 * bootstrap" sub-screen). Keeps the Setup-badge flow: DB/auth
 * preflight notices, bootstrap-state card, sign-in-first gate and the
 * super-admin link form — all behavior unchanged (see ./form.tsx +
 * ./actions.ts).
 */
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
  const plat = resolveAuthPlatform(h.get("x-product"));
  const tokenProduct = resolveTokenProduct(plat.dataProduct);

  return (
    <AuthShell
      dataProduct={tokenProduct}
      wordmarkSub={plat.wordmarkSub}
      tone={plat.tone}
      panelKicker={plat.panelKicker}
      testimonial={plat.testimonial}
      stats={plat.stats}
      footer={
        <span>
          © {new Date().getFullYear()} Arconique · {plat.domain}
        </span>
      }
    >
      <AuthHead eyebrow="Setup">
        Admin <em>bootstrap.</em>
      </AuthHead>
      <p className="auth-sub">
        Link a Supabase Auth user to an internal{" "}
        <code className="font-mono text-xs">app_users</code> record and grant
        the <code className="font-mono text-xs">super_admin</code> role. The
        first run is open while no super-admin exists; subsequent runs require{" "}
        <code className="font-mono text-xs">ADMIN_BOOTSTRAP_SECRET</code>.
      </p>

      {sp.ok === "1" && (
        <div className="auth-notice auth-notice-ok">
          <ShieldCheck className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
          <span>
            <strong>Bootstrap complete.</strong>{" "}
            {sp.first === "1"
              ? "First super-admin linked. The bootstrap route is now locked behind ADMIN_BOOTSTRAP_SECRET."
              : "Super-admin role linked successfully."}{" "}
            <Link href="/dashboard" className="auth-link">
              Open dashboard →
            </Link>
          </span>
        </div>
      )}

      {state.stage === "db_missing" && (
        <div className="auth-notice auth-notice-warn">
          <AlertTriangle className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
          <span>
            <strong>Database not configured.</strong> The platform database is
            not reachable. Verify your deploy configuration and rerun the
            bootstrap step once the database is online.
          </span>
        </div>
      )}

      {state.stage !== "db_missing" && !authReady && (
        <div className="auth-notice auth-notice-warn">
          <AlertTriangle className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
          <span>
            <strong>Supabase Auth not configured.</strong> Add{" "}
            <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            and{" "}
            <code className="font-mono text-xs">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            to <code className="font-mono text-xs">.env.local</code> and
            reload.
          </span>
        </div>
      )}

      {state.stage !== "db_missing" && authReady && (
        <>
          <div className="auth-callout">
            <span className="auth-callout-ic">
              <ShieldCheck
                className="w-[15px] h-[15px]"
                strokeWidth={1.7}
                aria-hidden
              />
            </span>
            <span className="flex-1">
              <strong>
                {state.stage === "needs_super_admin"
                  ? "First super-admin not yet linked"
                  : "Super-admin already exists"}
              </strong>
              <br />
              {state.stage === "needs_super_admin"
                ? "First link is open — anyone signed in can claim it. Lock down by completing this step."
                : "ADMIN_BOOTSTRAP_SECRET is required to grant additional super-admin roles."}
            </span>
            {auth ? (
              <Badge tone="success">Signed in</Badge>
            ) : (
              <Badge tone="warning">No session</Badge>
            )}
          </div>

          {!auth ? (
            <div className="auth-notice auth-notice-info">
              <KeyRound className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
              <span>
                <strong>Sign in first.</strong> You need an active Supabase
                session to bootstrap. Create one at{" "}
                <Link href="/login" className="auth-link">
                  /login
                </Link>{" "}
                (or sign up directly via your Supabase dashboard) and return
                here.
              </span>
            </div>
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

      <div className="auth-foot-row">
        <span className="muted">
          Bootstrap actions are append-logged to{" "}
          <code className="font-mono">audit_events</code>. The service-role key
          is never used here — every operation runs as the requesting user
          against Drizzle.
        </span>
        <div className="mt-3 flex gap-4">
          <Link href="/login" className="auth-link">
            Login
          </Link>
          <Link href="/dashboard" className="auth-link">
            Dashboard
          </Link>
          <Link href="/" className="auth-link">
            Home
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
