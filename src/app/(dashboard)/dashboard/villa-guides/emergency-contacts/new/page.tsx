import { PageHeader } from "@/components/ui/page-header";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { ContactForm } from "@/components/villa-guides/contact-form";

export const metadata = { title: "New emergency contact" };
export const dynamic = "force-dynamic";

export default async function NewContactPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Emergency contacts", href: "/dashboard/villa-guides/emergency-contacts" },
          { label: "New" },
        ]}
        title="New emergency contact"
      />
      <ContactForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
