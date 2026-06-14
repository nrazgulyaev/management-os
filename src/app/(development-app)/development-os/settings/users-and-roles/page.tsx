import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb, rowsOf } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Users & roles · Settings" };
export const dynamic = "force-dynamic";

type RoleRow = {
  user_id: string;
  user_email: string;
  role_key: string;
  scope: string;
  is_primary: boolean;
  is_active: boolean;
  granted_at: string;
};

export default async function UsersAndRolesAdminPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/settings">Settings</Link> /{" "}
              <span>Users &amp; roles</span>
            </div>
            <h1>Users &amp; roles</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rowsResult = await safeQuery(
    "userRoles",
    db.execute(sql`
      SELECT r.user_id::text, u.email AS user_email, r.role_key,
             r.scope, r.is_primary, r.is_active,
             r.granted_at::text
        FROM app_user_roles r
        JOIN app_users u ON u.id = r.user_id
       WHERE r.is_active = TRUE
       ORDER BY u.email, r.is_primary DESC, r.role_key
       LIMIT 500
    `),
    null as unknown as Awaited<ReturnType<typeof db.execute>>,
  );
  const rows = rowsOf<RoleRow>(rowsResult);
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/settings">Settings</Link> /{" "}
            <span>Users &amp; roles</span>
          </div>
          <h1>Users &amp; roles</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${rows.length} active role grant(s).`}
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Active grants</div>
        {rows.length === 0 ? (
          <Card padding="default">
            <EmptyState
              title="No roles granted yet"
              description="Use the grantUserRole server action."
            />
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Scope</th>
                  <th scope="col">Primary</th>
                  <th scope="col">Granted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.user_id}-${r.role_key}-${i}`}>
                    <td className="row-title">{r.user_email}</td>
                    <td className="mono text-[12px]">{r.role_key}</td>
                    <td className="text-[12px]">{r.scope}</td>
                    <td>
                      {r.is_primary && <HandoffBadge tone="ok">primary</HandoffBadge>}
                    </td>
                    <td className="text-[12px] text-ink-3">
                      {new Date(r.granted_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
