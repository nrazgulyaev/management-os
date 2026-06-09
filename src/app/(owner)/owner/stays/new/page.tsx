import Link from "next/link";
import { EmptyState } from "@/components/ui/state";
import { listOwnerPortalChoicesForCurrentUser } from "@/features/owner-stays/services";
import { OwnerStayRequestForm } from "@/components/owner-stays/owner-request-form";

/**
 * P1 owner-rental-pool — "Request a stay" re-skin.
 *
 * Re-skinned off the older dashboard primitives (SectionHeading/Card) onto
 * the owner-portal lineage (display headline + terra accents + state kit).
 * The request form itself is the existing owner-stays client component.
 */

export const metadata = { title: "Request a stay" };
export const dynamic = "force-dynamic";

export default async function NewOwnerStayPage() {
  const choices = await listOwnerPortalChoicesForCurrentUser().catch(() => []);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[200px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-tertiary mb-2">
            Portfolio · stays · new
          </div>
          <h1
            className="display"
            style={{ fontSize: 42, fontWeight: 400, margin: 0, lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--ink)" }}
          >
            Request an owner stay
          </h1>
          <p className="text-sm text-ink-secondary mt-3 max-w-[60ch]">
            Owner stays are welcome. Operational costs and rental-pool compensation
            may apply depending on your policy and selected dates.
          </p>
        </div>
        <Link href="/owner/stays" className="btn btn-secondary btn-sm">
          ← My stays
        </Link>
      </div>

      {choices.length === 0 ? (
        <EmptyState
          variant="first-run"
          title="No villas available"
          body="We couldn't find any villas linked to your account. Please contact your property manager to confirm your portfolio."
        />
      ) : (
        <OwnerStayRequestForm choices={choices} />
      )}
    </div>
  );
}
