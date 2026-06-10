import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listAppUsers } from "@/features/auth/users-service";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await listAppUsers();
  const source = users[0]?.source ?? "mock";
  const activeCount = users.filter((u) => u.status === "active").length;
  const linkedCount = users.filter((u) => u.authLinked).length;
  const withRolesCount = users.filter((u) => u.roles.length > 0).length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/settings">Settings</Link> /{" "}
            <span>Users</span>
          </div>
          <h1>Users</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Internal app_users records and their role assignments. Linking new
            staff members to Supabase Auth happens via /setup/admin-bootstrap
            or invitation flows (v3+).
          </p>
        </div>
        <div className="actions">
          <SourceBadge source={source} />
        </div>
      </div>

      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Users" value={String(users.length)} sub="app_users records" />
        <Kpi
          label="Active"
          value={String(activeCount)}
          sub="status active"
          tone={activeCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Auth linked"
          value={String(linkedCount)}
          sub="Supabase Auth users"
        />
        <Kpi
          label="With roles"
          value={String(withRolesCount)}
          sub="at least one grant"
        />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        Directory · <em>{users.length}</em>
      </h2>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Status</th>
              <th scope="col">Roles</th>
              <th scope="col">Auth linked</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <TableEmpty colSpan={5}>
                No users yet. Use /setup/admin-bootstrap to claim the first
                super-admin.
              </TableEmpty>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link
                      href={`/dashboard/settings/users/${u.id}`}
                      className="text-ink font-medium hover:text-terra"
                    >
                      {u.fullName}
                    </Link>
                  </td>
                  <td className="mono text-[11px] text-ink-3">{u.email}</td>
                  <td>
                    <Badge tone={u.status === "active" ? "success" : "neutral"}>
                      {u.status}
                    </Badge>
                  </td>
                  <td className="text-xs">
                    {u.roles.length === 0
                      ? "—"
                      : u.roles.map((r) => (
                          <Badge key={r} tone="outline" className="mr-1">
                            {r}
                          </Badge>
                        ))}
                  </td>
                  <td>
                    {u.authLinked ? (
                      <Badge tone="success">Linked</Badge>
                    ) : (
                      <Badge tone="warning">No Supabase user</Badge>
                    )}
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
