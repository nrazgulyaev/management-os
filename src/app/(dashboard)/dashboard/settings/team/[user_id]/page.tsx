/**
 * Stage 9.E — team member detail page.
 *
 * Shows a single app_user's identity, current active grant(s), grant
 * history (revoked / superseded grants), and lets an admin change the
 * role via the ChangeRoleForm client component.
 *
 * Permission check is enforced at the action layer
 * (updateUserRoleAction → requirePermission("roles.assign")). The
 * page itself renders for anyone with read access; the form is gated
 * by the action's response.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema/identity";
import { appUserRoles } from "@/lib/db/schema/role-cabinets";
import { ROLE_DESCRIPTIONS } from "@/features/team/role-descriptions";
import { ChangeRoleForm } from "./change-role-form";

export const metadata: Metadata = { title: "Team member · Settings" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  invited: "info",
  suspended: "warning",
  archived: "neutral",
};

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ user_id: string }>;
}) {
  const { user_id: userId } = await params;
  const db = getDb();
  if (!db) {
    return (
      <>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/dashboard/settings">Settings</Link> /{" "}
              <Link href="/dashboard/settings/team">Team</Link> /{" "}
              <span>Member</span>
            </div>
            <h1>Team member</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </>
    );
  }

  const user = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!user) notFound();

  const grants = await db
    .select()
    .from(appUserRoles)
    .where(eq(appUserRoles.userId, userId))
    .orderBy(desc(appUserRoles.grantedAt));

  const activeGrants = grants.filter((g) => g.isActive);
  const historyGrants = grants.filter((g) => !g.isActive);
  const currentPrimary = activeGrants.find((g) => g.isPrimary) ?? activeGrants[0];

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/settings">Settings</Link> /{" "}
            <Link href="/dashboard/settings/team">Team</Link> /{" "}
            <span>{user.fullName}</span>
          </div>
          <h1>{user.fullName}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            {user.email}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/settings/team"
            className="btn btn-ghost btn-sm"
          >
            ← Back to team
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Status"
          value={user.status}
          tone={user.status === "active" ? "success" : undefined}
        />
        <Kpi
          label="Active grants"
          value={String(activeGrants.length)}
          sub="app_user_roles"
          tone={activeGrants.length > 0 ? "success" : "warn"}
        />
        <Kpi
          label="Prior grants"
          value={String(historyGrants.length)}
          sub="revoked / superseded"
        />
        <Kpi
          label="Joined"
          value={new Date(user.createdAt).toLocaleDateString()}
          sub={user.timezone}
        />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        Profile
      </h2>
      <div className="card card-pad mb-[18px]">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="label">Email</dt>
            <dd className="mono text-[11px]">{user.email}</dd>
          </div>
          <div>
            <dt className="label">Status</dt>
            <dd>
              <Badge tone={STATUS_TONE[user.status] ?? "neutral"}>
                {user.status}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="label">Joined</dt>
            <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="label">Timezone</dt>
            <dd>{user.timezone}</dd>
          </div>
        </dl>
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        Current grant
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5">
        Active cabinet grants in app_user_roles. Changing the role replaces
        the current grant; the old one is preserved in history below.
      </p>
      {activeGrants.length === 0 ? (
        <div className="mb-[18px]">
          <EmptyState
            title="No active role"
            description="This user has no active grants. Use the form below to assign a role."
          />
        </div>
      ) : (
        <ul className="space-y-2 mb-[18px]">
          {activeGrants.map((g) => {
            const desc = ROLE_DESCRIPTIONS[g.roleKey as keyof typeof ROLE_DESCRIPTIONS];
            return (
              <li key={g.id} className="card card-pad">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="font-medium text-ink">
                      {desc?.label ?? g.roleKey.replace(/_/g, " ")}
                    </span>
                    {g.isPrimary && (
                      <span className="ml-2 text-xs text-ink-3">
                        (primary)
                      </span>
                    )}
                    {desc && (
                      <p className="text-xs text-ink-3 mt-1">
                        {desc.blurb}
                      </p>
                    )}
                  </div>
                  <div className="text-right mono text-[11px] text-ink-3">
                    <div>scope: {g.scope}</div>
                    <div>
                      granted {new Date(g.grantedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="card card-pad mb-[18px]">
        <ChangeRoleForm
          userId={user.id}
          userEmail={user.email}
          currentRoleKey={currentPrimary?.roleKey ?? null}
        />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        History · <em>{historyGrants.length}</em>
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5">
        Grants that have been revoked or superseded by a newer grant.
      </p>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Scope</th>
              <th scope="col">Granted</th>
              <th scope="col">Revoked</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {historyGrants.length === 0 ? (
              <TableEmpty colSpan={5}>No prior grants.</TableEmpty>
            ) : (
              historyGrants.map((g) => (
                <tr key={g.id}>
                  <td className="text-xs">
                    {g.roleKey.replace(/_/g, " ")}
                  </td>
                  <td className="text-xs">{g.scope}</td>
                  <td className="text-xs text-ink-3">
                    {new Date(g.grantedAt).toLocaleDateString()}
                  </td>
                  <td className="text-xs text-ink-3">
                    {g.revokedAt
                      ? new Date(g.revokedAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="text-xs text-ink-3">
                    {g.revocationReason ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Avoid lint warnings on unused drizzle helpers if a future refactor
// trims the query shape.
void and;
