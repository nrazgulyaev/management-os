/**
 * Role-access "who-sees-what" matrix editor (P0 design-live gap).
 *
 * A cabinet × role grid over the canonical roles in
 * `permission-matrix.ts`. Each cell is the role's read access to a cabinet;
 * the default comes from ROLE_CAPABILITIES["{cabinet}.read"]. Admins with
 * `roles.assign` can override any cell — deviations persist to
 * `role_access_overrides` (migration 0128).
 *
 * Read access gated to `users.read` (super_admin / director); editing gated
 * inside the action to `roles.assign` (super_admin).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db/client";
import {
  getCurrentUserContext,
  hasPermission,
} from "@/features/auth/permissions";
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

  const ctx = await getCurrentUserContext();
  if (!hasPermission(ctx, "users.read")) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          breadcrumbs={[
            { label: "Settings", href: "/dashboard/settings" },
            { label: "Role access matrix" },
          ]}
          title="Role access matrix"
        />
        <EmptyState
          title="Admin access required"
          description="Only an organisation admin can view the role-access matrix."
          action={
            <Button asChild variant="secondary">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const canEdit = hasPermission(ctx, "roles.assign");
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
        description="A grid of cabinets against roles. Tick a cell to grant a role read access to a cabinet. Defaults come from the built-in permission table; your changes are saved as overrides."
      />

      <Section
        eyebrow="Matrix"
        title="Cabinet access by role"
        description={
          canEdit
            ? "Toggle cells, then Save. Cells outlined in amber differ from the built-in default."
            : "Read-only — only a super-admin can change the matrix."
        }
      >
        <MatrixEditor initialOverrides={initialOverrides} readOnly={!canEdit} />
      </Section>
    </div>
  );
}
