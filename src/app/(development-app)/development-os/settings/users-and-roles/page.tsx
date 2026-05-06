import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
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
        <PageHeader title="Users & roles" />
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
  const rows =
    ((rowsResult as unknown as { rows?: RoleRow[] })?.rows ?? []) as RoleRow[];
  return (
    <DevelopmentShell>
      <PageHeader
        title="Users & roles"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Settings" },
          { label: "Users & roles" },
        ]}
        description={`${rows.length} active role grant(s).`}
      />
      <Section title="Active grants">
        {rows.length === 0 ? (
          <EmptyState
            title="No roles granted yet"
            description="Use the grantUserRole server action."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">User</th>
                <th>Role</th>
                <th>Scope</th>
                <th>Primary</th>
                <th>Granted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.user_id}-${r.role_key}-${i}`} className="border-b border-line-soft">
                  <td className="py-2">{r.user_email}</td>
                  <td className="font-mono text-xs">{r.role_key}</td>
                  <td className="text-xs">{r.scope}</td>
                  <td>
                    {r.is_primary && <Badge tone="success">primary</Badge>}
                  </td>
                  <td className="text-xs text-ink-tertiary">
                    {new Date(r.granted_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
