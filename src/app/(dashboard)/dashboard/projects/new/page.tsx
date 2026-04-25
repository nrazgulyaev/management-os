import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ProjectForm } from "./form";

export const metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Portfolio", href: "/dashboard" },
          { label: "Projects", href: "/dashboard/projects" },
          { label: "New" },
        ]}
        title="New project"
        description="Create a new villa project. Slug must be lowercase and hyphenated; once published, owner-portal links use it."
      />
      <DbStatusNotice />
      <ProjectForm mode="create" />
    </div>
  );
}
