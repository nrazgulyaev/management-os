import { SectionHeading } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ProjectForm } from "./form";

export const metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Portfolio · projects · new"
        title="New project"
        subtitle="Create a new villa project. Slug must be lowercase and hyphenated; once published, owner-portal links use it."
      />
      <DbStatusNotice />
      <ProjectForm mode="create" />
    </div>
  );
}
