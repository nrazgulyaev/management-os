import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listResponsibilityScopes } from "@/features/responsibility-scopes/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { listAppUsers } from "@/features/auth/users-service";
import { ResponsibilityScopeForm } from "@/components/responsibility-scopes/scope-form";
import { SettingsRowActions } from "@/components/dashboard/settings/settings-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Responsibility scopes" };
export const dynamic = "force-dynamic";

export default async function ResponsibilityScopesPage() {
  const [scopes, villas, projects, users] = await Promise.all([
    listResponsibilityScopes({ status: "active" }),
    listVillas(),
    listProjects(),
    listAppUsers(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Responsibility scopes" },
        ]}
        title="Responsibility scopes"
        description="A user_role grants the role-level permissions; a scope narrows the actionable surface to a project / villa / category. NULL fields mean 'any'."
      />

      <Section eyebrow="Active scopes" title={`${scopes.length} rows`}>
        {scopes.length === 0 ? (
          <NoItemsYet
            entityLabel="responsibility scopes"
            description="Narrow a user's role-level permissions to a specific project, villa, or task category. Add the first scope below."
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">User</th>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-left px-3 py-2">Project</th>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-left px-3 py-2">Role</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {scopes.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 text-ink font-medium">
                      {s.userFullName ?? s.userId}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone="info">{s.scopeType}</Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {s.projectName ?? "any"}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {s.villaCode ?? "any"}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {s.taskCategory ?? "any"}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {s.roleKey ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <SettingsRowActions
                        kind="scope"
                        row={{
                          id: s.id,
                          displayName: s.userFullName ?? s.userId,
                          values: {
                            scopeType: s.scopeType,
                            roleKey: s.roleKey ?? "",
                            projectId: s.projectId ?? "",
                            villaId: s.villaId ?? "",
                            taskCategory: s.taskCategory ?? "",
                          },
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section eyebrow="Add" title="New scope">
        <ResponsibilityScopeForm
          users={users.map((u) => ({ id: u.id, label: u.fullName ?? u.email }))}
          projects={projects.map((p) => ({ id: p.id, label: p.name }))}
          villas={villas.map((v) => ({
            id: v.id,
            label: `${v.unitCode} · ${v.projectName}`,
          }))}
        />
      </Section>
    </div>
  );
}
