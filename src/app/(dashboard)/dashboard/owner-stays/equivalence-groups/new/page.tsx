import { PageHeader } from "@/components/ui/page-header";
import { listProjects } from "@/features/projects/services";
import { CreateGroupForm } from "@/components/owner-stays/create-group-form";

export const metadata = { title: "New equivalence group" };
export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
  const projects = await listProjects();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner stays", href: "/dashboard/owner-stays" },
          { label: "Equivalence groups", href: "/dashboard/owner-stays/equivalence-groups" },
          { label: "New" },
        ]}
        title="New equivalence group"
        description="A pool of swap-comparable villas. After creating, add members on the list page."
      />
      <CreateGroupForm projects={projects.map((p) => ({ id: p.id, label: p.name }))} />
    </div>
  );
}
