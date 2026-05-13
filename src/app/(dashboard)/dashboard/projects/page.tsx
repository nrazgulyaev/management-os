import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ArrowUpRight } from "lucide-react";
import { listProjects } from "@/features/projects/services";
import { ProjectAddButton } from "@/components/projects/project-add-button";

export const metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

const statusTone: Record<string, "success" | "gold" | "neutral" | "warning" | "info"> = {
  managed: "success",
  active: "gold",
  under_construction: "info",
  planning: "neutral",
  archived: "warning",
};

export default async function ProjectsPage() {
  const projects = await listProjects();
  const source = projects[0]?.source ?? "mock";

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Portfolio", href: "/dashboard" },
          { label: "Projects" },
        ]}
        title="Projects"
        description="Active Bali villa projects under Arconique management. Each project carries its own ownership model, allocation rules, and reserve policy."
        actions={
          <div className="flex gap-2 items-center">
            <SourceBadge source={source} />
            <ProjectAddButton />
          </div>
        }
      />

      <DbStatusNotice />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/dashboard/projects/${p.slug}`}
            className="group rounded-3xl border border-line-soft bg-surface p-7 flex flex-col gap-4 hover:border-line-strong hover:shadow-soft-card transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="outline">{p.area ?? "—"}</Badge>
                  <Badge tone={statusTone[p.status] ?? "neutral"}>
                    {p.status.replace("_", " ")}
                  </Badge>
                  <Badge tone="neutral">{p.managementStatus.replace("_", " ")}</Badge>
                </div>
                <h3 className="text-display text-[24px] leading-tight font-medium text-ink mt-3">
                  {p.name}
                </h3>
                <p className="text-sm text-ink-secondary mt-2 leading-relaxed line-clamp-3">
                  {p.concept ?? p.description ?? "—"}
                </p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-ink-tertiary group-hover:text-ink shrink-0" strokeWidth={1.75} />
            </div>
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-line-soft">
              <Stat label="Villas" value={p.totalVillas?.toString() ?? "—"} />
              <Stat label="Location" value={p.location} clamp />
              <Stat label="Slug" value={p.slug} mono />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  clamp,
}: {
  label: string;
  value: string;
  mono?: boolean;
  clamp?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div
        className={`text-sm text-ink mt-1 ${mono ? "font-mono tabular-nums" : ""} ${clamp ? "truncate" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
