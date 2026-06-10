import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import {
  listRoleSummaries,
  KPI_LABEL,
} from "@/lib/development/server/workspace/role-framing";

/**
 * UNIT build-workspace-roleviews · role index —
 * `/development-os/workspace/role`.
 *
 * Honest entry point for the role-view drill: the enumerable RBAC role
 * set (`VALID_CABINET_ROLES`), each linking to its framed workspace
 * view. No reads — pure enumeration of the role catalog.
 */

export const metadata: Metadata = { title: "Workspace · role views" };

export default function WorkspaceRoleIndexPage() {
  const roles = listRoleSummaries();

  return (
    <>
      <SectionHeading
        eyebrow={`Workspace · role views · ${roles.length} roles`}
        title={
          <>
            Role-aware <em>workspace</em>.
          </>
        }
        subtitle="The command-center attention feed + KPI strip, framed for each RBAC role. The role set is driven from the canonical role catalog — pick a lens."
        actions={
          <Link href="/development-os" className="btn btn-dark btn-sm">
            ← Command center
          </Link>
        }
      />

      <Card padding="none" overflowHidden>
        <div className="px-[22px] py-3.5 border-b border-line bg-muted">
          <h2 className="display text-[20px] font-normal text-ink m-0">
            {roles.length} role lenses
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-2 p-5 max-[900px]:grid-cols-2 max-[600px]:grid-cols-1">
          {roles.map((r) => (
            <Link
              key={r.role}
              href={`/development-os/workspace/role/${r.role}`}
              className="px-3.5 py-3 border border-line rounded-[8px] bg-bg-3 no-underline hover:border-amber"
            >
              <div className="display text-[15px] text-ink">{r.label}</div>
              <div className="mono text-[10.5px] text-ink-3 mt-1 truncate">
                {r.leadKpis.map((k) => KPI_LABEL[k]).join(" · ")}
              </div>
              {r.blurb && (
                <div className="text-[12px] text-ink-3 mt-1.5 leading-snug">
                  {r.blurb}
                </div>
              )}
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
