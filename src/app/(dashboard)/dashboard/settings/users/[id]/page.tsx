import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DbStatusNotice } from "@/components/admin/db-status";
import { GrantForm } from "@/components/admin/grant-form";
import { getDb } from "@/lib/db/client";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
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
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[
            { label: "Settings", href: "/dashboard/settings" },
            { label: "Users", href: "/dashboard/settings/users" },
            { label: "User" },
          ]}
          title="User profile"
        />
        <DbStatusNotice />
      </div>
    );
  }

  const userResult = await safeList("getUserById", () =>
    db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1),
  );
  const user = userResult.value[0];
  if (!user) notFound();

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

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Users", href: "/dashboard/settings/users" },
          { label: user.fullName },
        ]}
        title={user.fullName}
        description={`${user.email} · ${user.status}`}
        actions={
          <Badge tone={user.authUserId ? "success" : "warning"}>
            {user.authUserId ? "Auth linked" : "No Supabase user"}
          </Badge>
        }
      />
      <DbStatusNotice />

      <Section eyebrow="Roles" title="System roles">
        {userRoleRows.length === 0 ? (
          <div className="text-sm text-ink-tertiary">No roles assigned yet.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {userRoleRows.map((r) => (
              <Badge key={r.key} tone="outline">
                {r.key}
              </Badge>
            ))}
          </div>
        )}
      </Section>

      <Section
        eyebrow="Owner-portal access"
        title="Owners this user can read"
      >
        <Table>
          <THead>
            <TR>
              <TH>Owner</TH>
              <TH>Type</TH>
              <TH>Status</TH>
              <TH>Granted</TH>
              <TH>Action</TH>
            </TR>
          </THead>
          <TBody>
            {grants.length === 0 ? (
              <TR>
                <TD colSpan={5} className="text-center py-8 text-ink-tertiary">
                  No grants yet.
                </TD>
              </TR>
            ) : (
              grants.map((g) => (
                <TR key={g.id}>
                  <TD className="text-ink">{g.ownerName}</TD>
                  <TD>
                    <Badge tone="outline">{g.grantType}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={g.status === "active" ? "success" : "neutral"}>
                      {g.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-ink-tertiary tabular-nums">
                    {new Date(g.grantedAt).toLocaleDateString("en-GB")}
                  </TD>
                  <TD>
                    {g.status === "active" ? (
                      <form
                        action={async (formData: FormData) => {
                          "use server";
                          formData.set("id", g.id);
                          await revokeOwnerAccessGrantAction(null, formData);
                        }}
                      >
                        <Button size="sm" variant="ghost" type="submit">
                          Revoke
                        </Button>
                      </form>
                    ) : (
                      <form
                        action={async (formData: FormData) => {
                          "use server";
                          formData.set("id", g.id);
                          await reactivateOwnerAccessGrantAction(null, formData);
                        }}
                      >
                        <Button size="sm" variant="ghost" type="submit">
                          Reactivate
                        </Button>
                      </form>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Section>

      <Section eyebrow="Grant access" title="Add this user to an owner">
        <GrantForm
          fixedAppUserId={user.id}
          owners={owners.map((o) => ({ id: o.id, label: o.displayName }))}
          cancelHref={`/dashboard/settings/users`}
        />
      </Section>
    </div>
  );
}
