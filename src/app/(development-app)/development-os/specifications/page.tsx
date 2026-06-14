import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { SpecificationAddButton } from "@/components/development/specifications/specification-add-button";
import { getDb } from "@/lib/db/client";
import { listSpecifications } from "@/lib/development/server/specifications/specification-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Specifications · Development OS",
};
export const dynamic = "force-dynamic";

export default async function SpecificationsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Specifications</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "listSpecifications",
    listSpecifications(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Knowledge Base</span> / <span>Specifications</span>
          </div>
          <h1>Specifications library</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Material/finish specifications. Linked to BOQ items for material
            selections, and to quality standards for acceptance-criteria
            templates.
          </p>
        </div>
        <div className="actions">
          <SpecificationAddButton />
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No specifications yet"
          description="Add the first material/finish specification."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Catalog · All specifications</div>
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Name</th>
                  <th scope="col">Category</th>
                  <th scope="col">Brand</th>
                  <th scope="col">Model</th>
                  <th scope="col">Color</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="font-mono text-xs">
                      <Link
                        href={`/development-os/specifications/${encodeURIComponent(s.specCode)}`}
                        className="hover:underline"
                      >
                        {s.specCode}
                      </Link>
                    </td>
                    <td className="row-title">{s.specName}</td>
                    <td>
                      <HandoffBadge tone="soft">{s.specCategory}</HandoffBadge>
                    </td>
                    <td className="text-xs">{s.brand ?? "—"}</td>
                    <td className="font-mono text-xs">{s.modelNumber ?? "—"}</td>
                    <td className="text-xs">{s.colorCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}
