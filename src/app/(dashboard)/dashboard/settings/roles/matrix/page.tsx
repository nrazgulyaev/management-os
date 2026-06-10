/**
 * Role-access "who-sees-what" matrix (P0 design-live gap; Keystone mock
 * `cc-functional-handoff/cabinets/new/Keystone.html` → RBAC view).
 *
 * A cabinet × role grid over the canonical roles in
 * `permission-matrix.ts`. Each cell is the role's read access to a cabinet;
 * the default comes from ROLE_CAPABILITIES["{cabinet}.read"], with persisted
 * (org, cabinet, role) overrides layered on top — the SAME
 * `effectiveAccess()` mapping `requireCabinetAccess` / the sidebar filter
 * use, so what this grid shows is exactly what the nav and route gates do.
 *
 * Viewing is open to anyone with settings access (like its neighbours —
 * team, users, security): every `CabinetGate` denial screen links here, so
 * a non-admin must be able to see WHY their role is gated. Their own role
 * column is highlighted. Editing stays gated to `roles.assign`
 * (super_admin) — enforced both here (readOnly grid) and inside the action.
 */

import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import {
  getCurrentUserContext,
  hasPermission,
} from "@/features/auth/permissions";
import type { RoleKey } from "@/features/auth/permission-matrix";
import { getRoleAccessOverrides } from "@/features/keystone/services";
import {
  MATRIX_CABINETS,
  MATRIX_ROLES,
  defaultAccess,
  cellKey,
} from "@/features/keystone/matrix";
import { MatrixEditor, type InitialOverride } from "./matrix-editor";

export const metadata: Metadata = { title: "Role access matrix · Settings" };
export const dynamic = "force-dynamic";

export default async function RoleMatrixPage() {
  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Role access matrix" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </div>
    );
  }

  // Viewing is open like its settings neighbours (team/users/security carry
  // no extra read gate) — the CabinetGate denial screen links here, so the
  // matrix itself must never lock a gated role out. Editing stays admin-only.
  const ctx = await getCurrentUserContext();
  const canEdit = hasPermission(ctx, "roles.assign");

  // Highlight the viewer's own role column(s). Super admin / demo mode are
  // always all-access and aren't matrix columns — flagged in copy instead.
  const allAccess = ctx.mode === "demo" || ctx.isSuperAdmin;
  const viewerRoles = allAccess
    ? []
    : MATRIX_ROLES.filter((r) => (ctx.roles as RoleKey[]).includes(r));
  const orgId = ctx.appUser?.organizationId ?? "";
  const overrideMap = orgId
    ? await getRoleAccessOverrides(orgId)
    : new Map<string, boolean>();

  // Reduce to only the cells that DIFFER from code defaults — the client
  // rebuilds the full grid from defaults and applies these on top.
  const initialOverrides: InitialOverride[] = [];
  for (const c of MATRIX_CABINETS) {
    for (const r of MATRIX_ROLES) {
      const k = cellKey(c.key, r);
      if (overrideMap.has(k)) {
        const val = overrideMap.get(k)!;
        if (val !== defaultAccess(c.key, r)) {
          initialOverrides.push({ cabinet: c.key, roleKey: r, canAccess: val });
        }
      }
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Access control"
        breadcrumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Users & roles", href: "/dashboard/settings/team" },
          { label: "Access matrix" },
        ]}
        title="Who sees what"
        description="A grid of cabinets against roles — the same mapping that filters the sidebar and gates every cabinet route. Defaults come from the built-in permission table; admin changes are saved as overrides."
      />

      <Section
        eyebrow="Matrix"
        title="Cabinet access by role"
        description={
          canEdit
            ? "Toggle cells, then Save. Cells outlined in amber differ from the built-in default."
            : allAccess
              ? "You always have full access to every cabinet, so no column is highlighted. Read-only — only a super-admin can change the matrix."
              : viewerRoles.length > 0
                ? "Your role's column is highlighted. Read-only — only a super-admin can change the matrix."
                : "Read-only — only a super-admin can change the matrix."
        }
      >
        <MatrixEditor
          initialOverrides={initialOverrides}
          readOnly={!canEdit}
          viewerRoles={viewerRoles}
        />
      </Section>
    </div>
  );
}
