import { redirect } from "next/navigation";
import { OwnerShell } from "@/components/layout/owner-shell";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { listMyVillas } from "@/features/owner-portal/owner-portal-queries";
import { getCurrentAppUser } from "@/features/auth/current-user";

/**
 * Sprint OWNER-PORTAL-1A — Server-side gate for /owner/*.
 *
 * Gating decision tree:
 *   1. Not signed in → /login?next=/owner
 *   2. Signed in + has owner_portal grant → proceed
 *   3. Signed in + super_admin + impersonation cookie → proceed
 *   4. Signed in but no path to an owner → /dashboard
 *
 * The shell renders the "OWNER VIEW · DEMO" banner whenever the
 * context is impersonation-based.
 */

export const dynamic = "force-dynamic";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser().catch(() => null);
  if (!user) {
    redirect("/login?next=/owner");
  }
  const ownerContext = await getCurrentOwnerContext().catch(() => null);
  if (!ownerContext) {
    // Logged-in user with no owner grant + no impersonation → not an
    // owner. Bounce them to Mgmt OS where /dashboard/owners offers
    // the impersonation entry point for super_admins.
    redirect("/dashboard");
  }
  const villas = await listMyVillas(ownerContext.ownerId).catch(() => []);
  const initials = ownerContext.ownerName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <OwnerShell
      ownerContext={{
        name: ownerContext.ownerName,
        initials,
        villasCount: villas.length,
        isImpersonating: ownerContext.isImpersonating,
      }}
    >
      {children}
    </OwnerShell>
  );
}
