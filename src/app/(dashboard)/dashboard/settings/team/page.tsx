/**
 * Stage 9.D — owner team management.
 *
 * Lists current team members + their active app_user_roles + pending
 * invitations. Owner / admin can invite new members, resend pending
 * invitations, revoke pending invitations, and revoke active members.
 */

import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { appUsers } from "@/lib/db/schema/identity";
import { appUserRoles } from "@/lib/db/schema/role-cabinets";
import { teamInvitations } from "@/lib/db/schema/team-invitations";
import Link from "next/link";
import { InviteForm } from "./invite-form";
import { TeamRowActions } from "./row-actions";

export const metadata: Metadata = { title: "Team · Settings" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  invited: "info",
  suspended: "warning",
  archived: "neutral",
  pending: "warning",
  accepted: "success",
  revoked: "danger",
  expired: "neutral",
};

export default async function TeamSettingsPage() {
  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Team" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </div>
    );
  }

  // Pull active app_users + their cabinet role grants in two queries.
  const userRows = await db
    .select({
      id: appUsers.id,
      email: appUsers.email,
      fullName: appUsers.fullName,
      status: appUsers.status,
      createdAt: appUsers.createdAt,
    })
    .from(appUsers)
    .orderBy(desc(appUsers.createdAt));

  const activeRoles = await db
    .select({
      userId: appUserRoles.userId,
      roleKey: appUserRoles.roleKey,
      isPrimary: appUserRoles.isPrimary,
      grantedAt: appUserRoles.grantedAt,
    })
    .from(appUserRoles)
    .where(eq(appUserRoles.isActive, true));

  const rolesByUser = new Map<string, Array<{ roleKey: string; isPrimary: boolean }>>();
  for (const r of activeRoles) {
    const arr = rolesByUser.get(r.userId) ?? [];
    arr.push({ roleKey: r.roleKey, isPrimary: r.isPrimary });
    rolesByUser.set(r.userId, arr);
  }

  const pendingInvitations = await db
    .select()
    .from(teamInvitations)
    .where(eq(teamInvitations.status, "pending"))
    .orderBy(desc(teamInvitations.createdAt));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Team" },
        ]}
        title="Team"
        description="Invite teammates, assign roles, and revoke access. Invitations expire 7 days after they're sent."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/dashboard/setup">Run setup</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard/settings/roles/matrix">Access matrix</Link>
            </Button>
          </>
        }
      />

      <Section
        eyebrow="Compose"
        title="Invite a new teammate"
        description="They'll receive an email with an acceptance link. The link expires after 7 days."
      >
        <InviteForm />
      </Section>

      <Section
        eyebrow="Pending"
        title={`${pendingInvitations.length} pending invitation${pendingInvitations.length === 1 ? "" : "s"}`}
      >
        {pendingInvitations.length === 0 ? (
          <EmptyState
            title="No pending invitations"
            description="When you invite a teammate, the invitation will appear here until accepted, revoked, or expired."
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50">
                <tr className="text-left text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Resends</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {pendingInvitations.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 font-mono text-xs">{inv.email}</td>
                    <td className="px-4 py-3 text-xs">
                      {inv.roleKey.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-tertiary">
                      {inv.lastEmailSentAt
                        ? new Date(inv.lastEmailSentAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-tertiary">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-xs">
                      {inv.resentCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TeamRowActions
                        kind="invitation"
                        invitationId={inv.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        eyebrow="Members"
        title={`${userRows.length} team member${userRows.length === 1 ? "" : "s"}`}
      >
        <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50">
              <tr className="text-left text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Roles</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {userRows.map((u) => {
                const userActiveRoles = rolesByUser.get(u.id) ?? [];
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3">{u.fullName}</td>
                    <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3 text-xs">
                      {userActiveRoles.length === 0 ? (
                        <span className="text-ink-tertiary">— no active grants</span>
                      ) : (
                        userActiveRoles.map((r) => (
                          <span
                            key={r.roleKey}
                            className="inline-block mr-1 rounded bg-muted/40 px-2 py-0.5"
                          >
                            {r.roleKey.replace(/_/g, " ")}
                            {r.isPrimary ? " ★" : ""}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Badge tone={STATUS_TONE[u.status] ?? "neutral"}>
                        {u.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-tertiary">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/dashboard/settings/team/${u.id}`}
                          className="rounded-full border border-line-soft bg-surface px-3 py-1 text-xs hover:bg-muted/40"
                        >
                          Manage
                        </Link>
                        <TeamRowActions
                          kind="user"
                          userId={u.id}
                          currentStatus={u.status}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// Avoid "unused import" lint warnings if `and` is later removed during refactors.
void and;
