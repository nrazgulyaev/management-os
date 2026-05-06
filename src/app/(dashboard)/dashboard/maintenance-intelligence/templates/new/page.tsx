import { PageHeader } from "@/components/ui/page-header";
import { TemplateForm } from "@/components/maintenance-intelligence/template-form";

export const metadata = { title: "New maintenance template" };
export const dynamic = "force-dynamic";

export default function NewTemplatePage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Maintenance intelligence", href: "/dashboard/maintenance-intelligence" },
          { label: "Templates", href: "/dashboard/maintenance-intelligence/templates" },
          { label: "New" },
        ]}
        title="New maintenance template"
      />
      <TemplateForm />
    </div>
  );
}
