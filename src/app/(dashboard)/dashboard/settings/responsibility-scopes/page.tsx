import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { listResponsibilityScopes } from "@/features/responsibility-scopes/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { listAppUsers } from "@/features/auth/users-service";
import { ResponsibilityScopeForm } from "@/components/responsibility-scopes/scope-form";
import { SettingsRowActions } from "@/components/dashboard/settings/settings-row-actions";

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
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/settings">Settings</Link> /{" "}
            <span>Responsibility scopes</span>
          </div>
          <h1>Responsibility scopes</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            A user_role grants the role-level permissions; a scope narrows the
            actionable surface to a project / villa / category. NULL fields
            mean &lsquo;any&rsquo;.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Active scopes"
          value={String(scopes.length)}
          sub="narrowed grants"
          tone={scopes.length > 0 ? "success" : undefined}
        />
        <Kpi label="Users" value={String(users.length)} sub="assignable" />
        <Kpi label="Projects" value={String(projects.length)} sub="scope targets" />
        <Kpi label="Villas" value={String(villas.length)} sub="scope targets" />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        Active scopes · <em>{scopes.length}</em>
      </h2>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Scope</th>
              <th scope="col">Project</th>
              <th scope="col">Villa</th>
              <th scope="col">Category</th>
              <th scope="col">Role</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {scopes.length === 0 ? (
              <TableEmpty colSpan={7}>
                No responsibility scopes yet. Narrow a user&apos;s role-level
                permissions to a specific project, villa, or task category —
                add the first scope below.
              </TableEmpty>
            ) : (
              scopes.map((s) => (
                <tr key={s.id}>
                  <td className="text-ink font-medium">
                    {s.userFullName ?? s.userId}
                  </td>
                  <td>
                    <Badge tone="info">{s.scopeType}</Badge>
                  </td>
                  <td>{s.projectName ?? "any"}</td>
                  <td>{s.villaCode ?? "any"}</td>
                  <td>{s.taskCategory ?? "any"}</td>
                  <td className="mono text-[11px] text-ink-3">
                    {s.roleKey ?? "—"}
                  </td>
                  <td className="text-right">
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
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        New scope
      </h2>
      <div className="card card-pad mb-[18px]">
        <ResponsibilityScopeForm
          users={users.map((u) => ({ id: u.id, label: u.fullName ?? u.email }))}
          projects={projects.map((p) => ({ id: p.id, label: p.name }))}
          villas={villas.map((v) => ({
            id: v.id,
            label: `${v.unitCode} · ${v.projectName}`,
          }))}
        />
      </div>
    </>
  );
}
