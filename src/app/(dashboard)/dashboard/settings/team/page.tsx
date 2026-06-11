/**
 * Stage 9.D — owner team management.
 *
 * Lists current team members + their active app_user_roles + pending
 * invitations. Owner / admin can invite new members, resend pending
 * invitations, revoke pending invitations, and revoke active members.
 */

import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { appUserRoles } from "@/lib/db/schema/role-cabinets";
import { teamInvitations } from "@/lib/db/schema/team-invitations";
import { getCurrentUserContext } from "@/features/auth/permissions";
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
      <>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/dashboard/settings">Settings</Link> /{" "}
              <span>Team</span>
            </div>
            <h1>Team</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </>
    );
  }

  // IDOR fix (defect 1): org-scope every list to the caller's organization.
  // The previous queries selected ALL app_users / app_user_roles /
  // team_invitations across every tenant.
  const ctx = await getCurrentUserContext();
  const orgId = ctx.appUser?.organizationId ?? null;
  if (!orgId) {
    return (
      <>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/dashboard/settings">Settings</Link> /{" "}
              <span>Team</span>
            </div>
            <h1>Team</h1>
          </div>
        </div>
        <EmptyState
          title="No organization context"
          description="Sign in with a team account to manage members."
        />
      </>
    );
  }

  // Pull active app_users (org-scoped) + their cabinet role grants.
  const userRows = await db
    .select({
      id: appUsers.id,
      email: appUsers.email,
      fullName: appUsers.fullName,
      status: appUsers.status,
      createdAt: appUsers.createdAt,
    })
    .from(appUsers)
    .where(eq(appUsers.organizationId, orgId))
    .orderBy(desc(appUsers.createdAt));

  const userIds = userRows.map((u) => u.id);

  const activeRoles =
    userIds.length === 0
      ? []
      : await db
          .select({
            userId: appUserRoles.userId,
            roleKey: appUserRoles.roleKey,
            isPrimary: appUserRoles.isPrimary,
            grantedAt: appUserRoles.grantedAt,
          })
          .from(appUserRoles)
          .where(
            and(
              eq(appUserRoles.isActive, true),
              inArray(appUserRoles.userId, userIds),
            ),
          );

  const rolesByUser = new Map<string, Array<{ roleKey: string; isPrimary: boolean }>>();
  for (const r of activeRoles) {
    const arr = rolesByUser.get(r.userId) ?? [];
    arr.push({ roleKey: r.roleKey, isPrimary: r.isPrimary });
    rolesByUser.set(r.userId, arr);
  }

  // Internal (user_roles) grants — the /dashboard cabinets — scoped to org users.
  const internalRoleRows =
    userIds.length === 0
      ? []
      : await db
          .select({ userId: userRoles.userId, key: roles.key })
          .from(userRoles)
          .innerJoin(roles, eq(roles.id, userRoles.roleId))
          .where(inArray(userRoles.userId, userIds));

  const internalRolesByUser = new Map<string, string[]>();
  for (const r of internalRoleRows) {
    const arr = internalRolesByUser.get(r.userId) ?? [];
    if (!arr.includes(r.key)) arr.push(r.key);
    internalRolesByUser.set(r.userId, arr);
  }

  const pendingInvitations = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.status, "pending"),
        eq(teamInvitations.organizationId, orgId),
      ),
    )
    .orderBy(desc(teamInvitations.createdAt));

  const activeMemberCount = userRows.filter(
    (u) => u.status === "active",
  ).length;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/settings">Settings</Link> /{" "}
            <span>Team</span>
          </div>
          <h1>Team</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Invite teammates, assign roles, and revoke access. Invitations
            expire 7 days after they&apos;re sent.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/setup" className="btn btn-ghost btn-sm">
            Run setup
          </Link>
          <Link
            href="/dashboard/settings/roles/matrix"
            className="btn btn-secondary btn-sm"
          >
            Access matrix
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Members" value={String(userRows.length)} sub="app_users" />
        <Kpi
          label="Active"
          value={String(activeMemberCount)}
          sub="status active"
          tone={activeMemberCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Pending invitations"
          value={String(pendingInvitations.length)}
          sub="awaiting acceptance"
          tone={pendingInvitations.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Active role grants"
          value={String(activeRoles.length)}
          sub="app_user_roles"
        />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        Invite a new teammate
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5">
        They&apos;ll receive an email with an acceptance link. The link
        expires after 7 days.
      </p>
      <div className="card card-pad mb-[18px]">
        <InviteForm />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        Pending invitations · <em>{pendingInvitations.length}</em>
      </h2>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Sent</th>
              <th scope="col">Expires</th>
              <th scope="col" className="num">Resends</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {pendingInvitations.length === 0 ? (
              <TableEmpty colSpan={6}>
                No pending invitations. When you invite a teammate, the
                invitation will appear here until accepted, revoked, or
                expired.
              </TableEmpty>
            ) : (
              pendingInvitations.map((inv) => (
                <tr key={inv.id}>
                  <td className="mono text-[11px]">{inv.email}</td>
                  <td className="text-xs">
                    {inv.roleKey.replace(/_/g, " ")}
                  </td>
                  <td className="text-xs text-ink-3">
                    {inv.lastEmailSentAt
                      ? new Date(inv.lastEmailSentAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="text-xs text-ink-3">
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="num tabular-nums text-xs">
                    {inv.resentCount}
                  </td>
                  <td className="text-right">
                    <TeamRowActions
                      kind="invitation"
                      invitationId={inv.id}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        Members · <em>{userRows.length}</em>
      </h2>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Cabinet roles</th>
              <th scope="col">Internal roles</th>
              <th scope="col">Status</th>
              <th scope="col">Joined</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {userRows.map((u) => {
              const userActiveRoles = rolesByUser.get(u.id) ?? [];
              const userInternalRoles = internalRolesByUser.get(u.id) ?? [];
              return (
                <tr key={u.id}>
                  <td className="text-ink font-medium">{u.fullName}</td>
                  <td className="mono text-[11px]">{u.email}</td>
                  <td className="text-xs">
                    {userActiveRoles.length === 0 ? (
                      <span className="text-ink-3">— no active grants</span>
                    ) : (
                      userActiveRoles.map((r) => (
                        <Badge
                          key={r.roleKey}
                          tone="outline"
                          className="mr-1"
                        >
                          {r.roleKey.replace(/_/g, " ")}
                          {r.isPrimary ? " ★" : ""}
                        </Badge>
                      ))
                    )}
                  </td>
                  <td className="text-xs">
                    {userInternalRoles.length === 0 ? (
                      <span className="text-ink-3">—</span>
                    ) : (
                      userInternalRoles.map((k) => (
                        <Badge key={k} tone="info" className="mr-1">
                          {k.replace(/_/g, " ")}
                        </Badge>
                      ))
                    )}
                  </td>
                  <td className="text-xs">
                    <Badge tone={STATUS_TONE[u.status] ?? "neutral"}>
                      {u.status}
                    </Badge>
                  </td>
                  <td className="text-xs text-ink-3">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/dashboard/settings/team/${u.id}`}
                        className="btn btn-secondary btn-sm"
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
    </>
  );
}

// Avoid "unused import" lint warnings if `and` is later removed during refactors.
void and;
