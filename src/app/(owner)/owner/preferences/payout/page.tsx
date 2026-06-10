import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getPayoutEditView } from "@/features/owner-portal/payout-edit-actions";
import { SectionHeading } from "@/components/dashboard/primitives";
import { OwnerPayoutEditForm } from "@/components/owner-portal/owner-payout-edit-form";

/**
 * 2FA-gated payout-method edit route.
 *
 * Net-new functional surface: /owner/preferences previously rendered
 * the payout method as a read-only row with a disabled "Change method"
 * button ("Editing requires 2FA"). This route delivers that flow — a
 * confirmation-step gate (no owner_2fa table exists) before the bank
 * details change.
 *
 * Owner-session-scoped (getCurrentOwnerContext + getPayoutEditView,
 * which re-gates via requireOwnerWrite). The two underlying actions
 * audit-log and stay read-only under impersonation.
 */

export const metadata = { title: "Edit payout method" };
export const dynamic = "force-dynamic";

export default async function OwnerPayoutEditPage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const readOnly = owner.isImpersonating;
  const current = await getPayoutEditView();

  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeading eyebrow="Settings · Payout" title="Edit payout method" />
        <p className="text-sm text-ink-secondary">
          We couldn&rsquo;t load your payout details right now. Please try again.
        </p>
        <Link href="/owner/preferences" className="btn btn-ghost btn-sm self-start">
          ← Back to settings
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="inbox-head">
        <div className="ih-text">
          <div className="ih-eyebrow">
            <Link href="/owner/preferences" className="hover:text-terra">
              Settings
            </Link>{" "}
            · Payout method
          </div>
          <h1 className="ih-title">Edit payout method</h1>
          <p className="ih-sub">
            Update where your monthly statement payouts wire. This change is
            gated by a confirmation step and recorded in your account audit log.
          </p>
        </div>
      </header>

      {readOnly && (
        <p className="text-xs text-ink-secondary">
          You&rsquo;re viewing as this owner — payout edits are disabled while
          impersonating.
        </p>
      )}

      <div className="max-w-2xl">
        <OwnerPayoutEditForm current={current} disabled={readOnly} />
      </div>
    </div>
  );
}
