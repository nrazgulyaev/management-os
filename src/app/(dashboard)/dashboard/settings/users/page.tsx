import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listAppUsers } from "@/features/auth/users-service";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await listAppUsers();
  const source = users[0]?.source ?? "mock";
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "Users" }]}
        title="Users"
        description="Internal app_users records and their role assignments. Linking new staff members to Supabase Auth happens via /setup/admin-bootstrap or invitation flows (v3+)."
        actions={<SourceBadge source={source} />}
      />
      <DbStatusNotice />

      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Status</TH>
            <TH>Roles</TH>
            <TH>Auth linked</TH>
          </TR>
        </THead>
        <TBody>
          {users.length === 0 ? (
            <TR>
              <TD colSpan={5} className="text-ink-tertiary text-center py-8">
                No users yet. Use /setup/admin-bootstrap to claim the first super-admin.
              </TD>
            </TR>
          ) : (
            users.map((u) => (
              <TR key={u.id}>
                <TD>
                  <Link
                    href={`/dashboard/settings/users/${u.id}`}
                    className="text-ink font-medium hover:text-accent"
                  >
                    {u.fullName}
                  </Link>
                </TD>
                <TD className="text-ink-secondary text-sm">{u.email}</TD>
                <TD>
                  <Badge tone={u.status === "active" ? "success" : "neutral"}>
                    {u.status}
                  </Badge>
                </TD>
                <TD className="text-xs text-ink-secondary">
                  {u.roles.length === 0
                    ? "—"
                    : u.roles.map((r) => (
                        <Badge key={r} tone="outline" className="mr-1">
                          {r}
                        </Badge>
                      ))}
                </TD>
                <TD>
                  {u.authLinked ? (
                    <Badge tone="success">Linked</Badge>
                  ) : (
                    <Badge tone="warning">No Supabase user</Badge>
                  )}
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
