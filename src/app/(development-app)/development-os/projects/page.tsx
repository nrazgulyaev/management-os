import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { ProjectsList } from "@/components/development/projects-list";
import { getDevelopmentProjects } from "@/lib/development/server/projects";

export const metadata: Metadata = { title: "Projects · Development OS" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await getDevelopmentProjects();

  const counts = {
    total: projects.length,
    active: projects.filter(
      (p) => p.phase === "under_construction" || p.phase === "fit_out",
    ).length,
    planning: projects.filter(
      (p) =>
        p.phase === "permitting" ||
        p.phase === "design" ||
        p.phase === "pre_acquisition" ||
        p.phase === "acquisition",
    ).length,
  };

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[{ label: "Development OS", href: "/development-os" }, { label: "Projects" }]}
        eyebrow={`${counts.total} projects · ${counts.active} active · ${counts.planning} planning`}
        title="Projects"
        description="Every project Arconique is currently developing. Filter by lifecycle phase, search by name or location, or open a project to see its phases, land, units, and finance."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      <ProjectsList projects={projects} />
    </DevelopmentShell>
  );
}
