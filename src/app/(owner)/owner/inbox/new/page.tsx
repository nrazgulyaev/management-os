import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { OwnerComposeForm } from "@/components/owner-portal/owner-compose-form";

/**
 * Owner inbox compose route — start a new thread to Management.
 *
 * Net-new functional surface: the inbox could only reply into existing
 * threads. This route renders the compose form, which posts through
 * createOwnerThreadAction (real owner_threads + owner_messages write,
 * audit-logged) and redirects into the new thread.
 *
 * Owner-session-scoped (getCurrentOwnerContext); the write itself is
 * re-gated server-side by requireOwnerWrite. Impersonating super-admins
 * see the form but the action stays read-only.
 */

export const metadata = { title: "New message" };
export const dynamic = "force-dynamic";

export default async function OwnerInboxComposePage() {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const readOnly = owner.isImpersonating;

  return (
    <div className="flex flex-col gap-6">
      <header className="inbox-head">
        <div className="ih-text">
          <div className="ih-eyebrow">
            <Link href="/owner/inbox" className="hover:text-terra">
              Inbox
            </Link>{" "}
            · New message
          </div>
          <h1 className="ih-title">New message</h1>
          <p className="ih-sub">
            Start a new conversation with your management team. Pick a category
            so we can route it to the right person — they reply directly in your
            inbox.
          </p>
        </div>
      </header>

      {readOnly && (
        <p className="text-xs text-ink-secondary">
          You&rsquo;re viewing as this owner — sending is disabled while
          impersonating.
        </p>
      )}

      <div className="card card-pad max-w-2xl">
        <OwnerComposeForm disabled={readOnly} />
      </div>
    </div>
  );
}
