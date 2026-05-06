import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listGuideSectionsAdmin } from "@/features/villa-guides/services";

export const metadata = { title: "Guide sections" };
export const dynamic = "force-dynamic";

export default async function SectionsList() {
  const rows = await listGuideSectionsAdmin();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Sections" },
        ]}
        title="Guide sections"
        description="Sections shown on /stay/[token]. The villa-scoped row wins when both villa- and project-scoped rows exist for the same key."
        actions={
          <Link
            href="/dashboard/villa-guides/sections/new"
            className="text-sm px-3 py-1.5 rounded-sm border border-line-soft hover:border-line-strong"
          >
            + New section
          </Link>
        }
      />
      <Section eyebrow="Catalog" title={`${rows.length} sections`}>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No sections yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-left px-3 py-2">Section</th>
                  <th className="text-left px-3 py-2">Title</th>
                  <th className="text-right px-3 py-2">Sort</th>
                  <th className="text-left px-3 py-2">Visible</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink-secondary text-xs">
                      {r.villaId
                        ? `villa ${r.villaId.slice(0, 8)}`
                        : r.projectId
                          ? `project ${r.projectId.slice(0, 8)}`
                          : "global"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">{r.sectionKey}</td>
                    <td className="px-3 py-2 text-ink font-medium">{r.title}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sortOrder}</td>
                    <td className="px-3 py-2">
                      <Badge tone={r.guestVisible ? "success" : "neutral"}>
                        {r.guestVisible ? "guest" : "internal"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={r.status === "active" ? "success" : "neutral"}>
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
