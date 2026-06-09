import Link from "next/link";
import { SectionHeading } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
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
      <SectionHeading
        eyebrow="Portfolio · projects"
        title={
          <>
            Estates under <em>management</em>.
          </>
        }
        subtitle="Each project carries its own ownership model, allocation rules, and reserve policy. Click through for villas, owners, and the reserve ledger."
        actions={
          <div className="flex gap-2 items-center">
            <SourceBadge source={source} />
            <Link href="/dashboard/projects/new-complex" className="btn btn-secondary btn-sm">
              + New complex
            </Link>
            <ProjectAddButton />
          </div>
        }
      />

      <DbStatusNotice />

      <div className="pf-proj-grid">
        {projects.map((p) => (
          <Link key={p.id} href={`/dashboard/projects/${p.slug}`} className="pf-proj group">
            <div className="tags">
              <Badge tone="outline">{p.area ?? "—"}</Badge>
              <Badge tone={statusTone[p.status] ?? "neutral"}>
                {p.status.replace("_", " ")}
              </Badge>
            </div>
            <h3>{p.name}</h3>
            <p className="line-clamp-3">{p.concept ?? p.description ?? "—"}</p>
            <div className="stats">
              <Stat label="Villas" value={p.totalVillas?.toString() ?? "—"} />
              <Stat label="Location" value={p.area ?? p.location} />
              <Stat label="Management" value={p.managementStatus.replace("_", " ")} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="st min-w-0">
      <div className="l">{label}</div>
      <div className="v truncate capitalize">{value}</div>
    </div>
  );
}
