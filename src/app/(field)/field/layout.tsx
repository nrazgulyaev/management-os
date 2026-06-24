import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { FieldShell } from "@/components/layout/field-shell";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { enforceProductAccess } from "@/features/auth/products-access";
import { enforceMfaChallengeCleared } from "@/features/security-baseline/mfa-gate";
import { ServiceTemporarilyUnavailable } from "@/components/system/service-temporarily-unavailable";

/**
 * P0 security — server-side gate for the field PWA (/field/*).
 *
 * Before this gate the field surface had NO auth check: any anonymous
 * visitor could load /field/tasks/[id], whose loader (getOperationTaskById)
 * is unscoped and returned ANY task by id. The field PWA is an internal
 * staff tool, so it must require a signed-in user in live mode.
 *
 * Gating:
 *   1. Demo / no-DB mode → pass through (the platform is browsable
 *      without auth when Supabase/DB are unconfigured).
 *   2. Live mode, not signed in → /login?next=/field.
 *   3. Live mode, signed in → enforceProductAccess("mgmt") (field staff
 *      live under the Management OS product, same as /dashboard).
 *
 * Hardening mirrors (dashboard)/layout.tsx: the guard runs inside
 * try/catch; intentional redirect signals are re-thrown, and any
 * unexpected runtime error degrades to the "service unavailable" page
 * rather than leaking a stack or rendering a broken shell.
 */

export const dynamic = "force-dynamic";

function initialsFrom(name: string | null, email: string | null): string {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const letters = parts.slice(0, 2).map((p) => p[0]!.toUpperCase());
    if (letters.length > 0) return letters.join("");
  }
  const e = (email ?? "").trim();
  return e ? e[0]!.toUpperCase() : "?";
}

export default async function FieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let name: string | null = null;
  let email: string | null = null;
  try {
    const ctx = await getCurrentUserContext();
    // Demo / unconfigured-DB mode stays open so the platform is browsable.
    if (ctx.mode !== "demo") {
      if (!ctx.appUser) {
        redirect("/login?next=/field");
      }
      // MFA-ENFORCE-1 — a pending second-factor challenge takes priority
      // over the product gate: bounce to /login/mfa before the field
      // surface resolves. No-op for users without a verified factor (no
      // marker). Mirrors the dashboard / dev-os layouts; the redirect
      // signal is re-thrown by the catch below.
      await enforceMfaChallengeCleared();
      await enforceProductAccess("mgmt");
    }
    if (ctx.appUser) {
      name = ctx.appUser.fullName ?? null;
      email = ctx.appUser.email ?? null;
    }
  } catch (err) {
    if (isRedirectError(err)) throw err; // intentional redirect — preserve
    console.error("[layout/field] auth gate threw:", err);
    return <ServiceTemporarilyUnavailable area="mgmt" />;
  }
  const profile = { initials: initialsFrom(name, email), name, email };
  return <FieldShell profile={profile}>{children}</FieldShell>;
}
