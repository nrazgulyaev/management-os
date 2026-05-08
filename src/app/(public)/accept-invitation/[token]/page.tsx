/**
 * Stage 9.D — invitation acceptance page.
 *
 * Looks up the invitation by token, renders a small "Set your
 * password" form, then calls acceptInvitationAction (which creates
 * the auth user + provisions app_users + grants the saved role).
 *
 * The token + status are validated AGAIN by acceptInvitationAction —
 * this page is allowed to render the form even if the token is
 * stale because the action will return the right error.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt } from "drizzle-orm";
import { Logo } from "@/components/brand/logo";
import { getDb } from "@/lib/db/client";
import { teamInvitations } from "@/lib/db/schema/team-invitations";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept invitation · Arconique" };
export const dynamic = "force-dynamic";

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = getDb();
  const invitation = db
    ? await db
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.token, token),
            eq(teamInvitations.status, "pending"),
            gt(teamInvitations.expiresAt, new Date()),
          ),
        )
        .limit(1)
        .then((rows) => rows[0])
    : null;

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-canvas">
      <div className="flex flex-col px-6 md:px-12 lg:px-16 py-10">
        <Logo />
        <div className="flex-1 flex items-center">
          <div className="max-w-sm w-full mx-auto">
            <span className="text-label">Invitation</span>
            {!invitation ? (
              <>
                <h1 className="text-display text-[40px] leading-[1.05] font-medium mt-4 text-ink">
                  This link is no longer valid
                </h1>
                <p className="mt-3 text-ink-secondary">
                  The invitation may have expired, been revoked, or already
                  been used. Ask the person who invited you to send a new one.
                </p>
                <div className="mt-8">
                  <Link href="/login" className="underline">
                    Back to sign in
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-display text-[40px] leading-[1.05] font-medium mt-4 text-ink">
                  Welcome to Arconique
                </h1>
                <p className="mt-3 text-ink-secondary">
                  You've been invited to join as{" "}
                  <strong>{invitation.roleKey.replace(/_/g, " ")}</strong>.
                  Set a password to activate your account.
                </p>
                <AcceptForm
                  token={token}
                  email={invitation.email}
                />
                <p className="mt-6 text-xs text-stone-500">
                  By accepting you agree to our{" "}
                  <Link href="/legal/terms" className="underline">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link href="/legal/privacy" className="underline">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="hidden lg:flex bg-stone-50 items-center justify-center">
        <div className="max-w-md text-center px-8">
          <h2 className="font-display text-3xl text-stone-900 mb-3">
            Operate together
          </h2>
          <p className="text-stone-600 leading-relaxed">
            Arconique runs the workflows your team depends on — bookings,
            construction, finance, and AI agents — all in one workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
