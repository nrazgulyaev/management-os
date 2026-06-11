import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { GrantForm } from "@/components/admin/grant-form";
import { getDb } from "@/lib/db/client";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { safeList } from "@/features/system/db-health";
import { listAccessGrantsForAppUser } from "@/features/access-grants/services";
import { listOwners } from "@/features/owners/services";
import {
  reactivateOwnerAccessGrantAction,
  revokeOwnerAccessGrantAction,
} from "@/features/access-grants/actions";

export const metadata = { title: "User profile" };
export const dynamic = "force-dynamic";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  if (!db) {
    return (
      <>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/dashboard/settings">Settings</Link> /{" "}
              <Link href="/dashboard/settings/users">Users</Link> /{" "}
              <span>User</span>
            </div>
            <h1>User profile</h1>
          </div>
        </div>
        <DbStatusNotice />
      </>
    );
  }

  // IDOR fix (defect 1): org-scope the user lookup to the caller's org.
  const ctx = await getCurrentUserContext();
  const orgId = ctx.appUser?.organizationId ?? null;
  const userResult = await safeList("getUserById", () =>
    db
      .select()
      .from(appUsers)
      .where(
        orgId
          ? and(eq(appUsers.id, id), eq(appUsers.organizationId, orgId))
          : eq(appUsers.id, id),
      )
      .limit(1),
  );
  const user = userResult.value[0];
  if (!user) notFound();
  if (orgId && user.organizationId !== orgId) notFound();

  const userRoleResult = await safeList("getUserRoles", () =>
    db
      .select({ key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, id)),
  );
  const userRoleRows = userRoleResult.value;

  const grants = await listAccessGrantsForAppUser(id);
  const owners = await listOwners();
  const activeGrantCount = grants.filter((g) => g.status === "active").length;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/settings">Settings</Link> /{" "}
            <Link href="/dashboard/settings/users">Users</Link> /{" "}
            <span>{user.fullName}</span>
          </div>
          <h1>{user.fullName}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            {user.email} · {user.status}
          </p>
        </div>
        <div className="actions">
          <Badge tone={user.authUserId ? "success" : "warning"}>
            {user.authUserId ? "Auth linked" : "No Supabase user"}
          </Badge>
        </div>
      </div>

      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="System roles" value={String(userRoleRows.length)} sub="role grants" />
        <Kpi
          label="Owner grants"
          value={String(grants.length)}
          sub="owner-portal access"
        />
        <Kpi
          label="Active grants"
          value={String(activeGrantCount)}
          sub="currently readable"
          tone={activeGrantCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Auth"
          value={user.authUserId ? "Linked" : "Unlinked"}
          sub="Supabase Auth"
          tone={user.authUserId ? "success" : "warn"}
        />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        System roles
      </h2>
      <div className="card card-pad mb-[18px]">
        {userRoleRows.length === 0 ? (
          <div className="text-sm text-ink-3">No roles assigned yet.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {userRoleRows.map((r) => (
              <Badge key={r.key} tone="outline">
                {r.key}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        Owner-portal access · <em>{grants.length}</em>
      </h2>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Owner</th>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col">Granted</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {grants.length === 0 ? (
              <TableEmpty colSpan={5}>No grants yet.</TableEmpty>
            ) : (
              grants.map((g) => (
                <tr key={g.id}>
                  <td className="text-ink">{g.ownerName}</td>
                  <td>
                    <Badge tone="outline">{g.grantType}</Badge>
                  </td>
                  <td>
                    <Badge tone={g.status === "active" ? "success" : "neutral"}>
                      {g.status}
                    </Badge>
                  </td>
                  <td className="mono text-[11px] text-ink-3 tabular-nums">
                    {new Date(g.grantedAt).toLocaleDateString("en-GB")}
                  </td>
                  <td>
                    {g.status === "active" ? (
                      <form
                        action={async (formData: FormData) => {
                          "use server";
                          formData.set("id", g.id);
                          await revokeOwnerAccessGrantAction(null, formData);
                        }}
                      >
                        <button type="submit" className="btn btn-ghost btn-sm">
                          Revoke
                        </button>
                      </form>
                    ) : (
                      <form
                        action={async (formData: FormData) => {
                          "use server";
                          formData.set("id", g.id);
                          await reactivateOwnerAccessGrantAction(null, formData);
                        }}
                      >
                        <button type="submit" className="btn btn-ghost btn-sm">
                          Reactivate
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        Grant access
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5">
        Add this user to an owner.
      </p>
      <div className="card card-pad mb-[18px]">
        <GrantForm
          fixedAppUserId={user.id}
          owners={owners.map((o) => ({ id: o.id, label: o.displayName }))}
          cancelHref={`/dashboard/settings/users`}
        />
      </div>
    </>
  );
}
