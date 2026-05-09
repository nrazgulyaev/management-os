import Link from "next/link";
import { Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";

export const metadata = { title: "No product access" };
export const dynamic = "force-dynamic";

/**
 * Stage 10.H — Landing page for users whose org has zero
 * `products_enabled`. Reached when a workspace is provisioned without
 * Mgmt OS or Dev OS access (a billing-flow edge case once Stage 11 ships)
 * or when an admin temporarily revokes both products.
 *
 * Distinct from /login (sign-in CTA) and /sign-up (provision a new org)
 * — the user IS signed in; they just have nothing to use.
 */
export default function NoProductAccessPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <div className="rounded-md border border-line-soft bg-surface p-8 flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-warning-weak flex items-center justify-center">
              <Lock className="w-5 h-5 text-warning" strokeWidth={1.75} />
            </div>
            <h1 className="text-display text-xl font-medium text-ink">
              No product access
            </h1>
          </div>

          <p className="text-sm text-ink-secondary leading-relaxed">
            You&apos;re signed in, but your workspace doesn&apos;t have any
            Arconique product enabled. This usually means the workspace
            owner needs to choose a plan or grant your account access to
            Management OS or Development OS.
          </p>

          <div className="rounded-md bg-muted/40 px-4 py-3 text-xs text-ink-secondary leading-relaxed flex items-start gap-2">
            <Mail
              className="w-3.5 h-3.5 text-ink-tertiary mt-0.5 shrink-0"
              strokeWidth={1.75}
            />
            <span>
              Email your workspace administrator with the URL of this page.
              They can enable a product from{" "}
              <span className="font-mono text-ink">/dashboard/admin/orgs</span>
              .
            </span>
          </div>

          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <form action={signOutAction}>
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
            <Button asChild variant="ghost">
              <Link href="/">Return to landing</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
