import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Block 08 — the canonical "Forbidden" render for a gated cabinet route.
 *
 * Block 01 owns the underlying primitive (`<EmptyState variant="restricted">`);
 * this is the cabinet-shaped wrapper around it so every gated page denies
 * access the SAME way: a clean, branded panel — never a crash, never a
 * silent leak. Pages call:
 *
 *   const { allowed } = await requireCabinetAccess("finance");
 *   if (!allowed) return <CabinetGate cabinet="Finance" />;
 *
 * The matrix the admin edits in /dashboard/settings/roles/matrix drives
 * whether `allowed` is true, so this panel is the visible end of the
 * "who-sees-what" loop.
 */
export function CabinetGate({
  cabinet,
  reason,
}: {
  /** Human label, e.g. "Finance" — used in the heading + breadcrumb. */
  cabinet: string;
  /** Optional override copy for the restriction body. */
  reason?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Access control"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: cabinet }]}
        title={cabinet}
      />
      <EmptyState
        variant="restricted"
        title={`You don't have access to ${cabinet}`}
        body={
          reason ??
          "Your role isn't permitted to view this cabinet. An organisation admin can grant access in the role-access matrix."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/dashboard/settings/roles/matrix">Role access matrix</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
