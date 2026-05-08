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
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
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
      <div className="flex flex-col gap-8">
        <PageHeader title="Team member" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </div>
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
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Team", href: "/dashboard/settings/team" },
          { label: user.fullName },
        ]}
        title={user.fullName}
        description={user.email}
      />

      <Section eyebrow="Identity" title="Profile">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-ink-tertiary text-xs uppercase tracking-widest">
              Email
            </dt>
            <dd className="font-mono text-xs">{user.email}</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary text-xs uppercase tracking-widest">
              Status
            </dt>
            <dd>
              <Badge tone={STATUS_TONE[user.status] ?? "neutral"}>
                {user.status}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary text-xs uppercase tracking-widest">
              Joined
            </dt>
            <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary text-xs uppercase tracking-widest">
              Timezone
            </dt>
            <dd>{user.timezone}</dd>
          </div>
        </dl>
      </Section>

      <Section
        eyebrow="Role"
        title="Current grant"
        description="Active cabinet grants in app_user_roles. Changing the role replaces the current grant; the old one is preserved in history below."
      >
        {activeGrants.length === 0 ? (
          <EmptyState
            title="No active role"
            description="This user has no active grants. Use the form below to assign a role."
          />
        ) : (
          <ul className="space-y-2 mb-6">
            {activeGrants.map((g) => {
              const desc = ROLE_DESCRIPTIONS[g.roleKey as keyof typeof ROLE_DESCRIPTIONS];
              return (
                <li
                  key={g.id}
                  className="rounded border border-line-soft bg-surface px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="font-medium">
                        {desc?.label ?? g.roleKey.replace(/_/g, " ")}
                      </span>
                      {g.isPrimary && (
                        <span className="ml-2 text-xs text-ink-tertiary">
                          (primary)
                        </span>
                      )}
                      {desc && (
                        <p className="text-xs text-ink-secondary mt-1">
                          {desc.blurb}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-ink-tertiary">
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
        <ChangeRoleForm
          userId={user.id}
          userEmail={user.email}
          currentRoleKey={currentPrimary?.roleKey ?? null}
        />
      </Section>

      <Section
        eyebrow="History"
        title={`${historyGrants.length} prior grant${historyGrants.length === 1 ? "" : "s"}`}
        description="Grants that have been revoked or superseded by a newer grant."
      >
        {historyGrants.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No prior grants.</p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50">
                <tr className="text-left text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Scope</th>
                  <th className="px-4 py-2">Granted</th>
                  <th className="px-4 py-2">Revoked</th>
                  <th className="px-4 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {historyGrants.map((g) => (
                  <tr key={g.id}>
                    <td className="px-4 py-2 text-xs">
                      {g.roleKey.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-2 text-xs">{g.scope}</td>
                    <td className="px-4 py-2 text-xs text-ink-tertiary">
                      {new Date(g.grantedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-tertiary">
                      {g.revokedAt
                        ? new Date(g.revokedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-tertiary">
                      {g.revocationReason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="text-sm">
        <Link href="/dashboard/settings/team" className="underline">
          ← Back to team
        </Link>
      </div>
    </div>
  );
}

// Avoid lint warnings on unused drizzle helpers if a future refactor
// trims the query shape.
void and;
