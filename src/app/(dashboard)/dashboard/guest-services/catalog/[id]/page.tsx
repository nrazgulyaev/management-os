import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  getServiceById,
  listCategories,
} from "@/features/guest-services/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";
import { ServiceEditorForm } from "@/components/guest-services/service-editor";
import { OptionEditorForm } from "@/components/guest-services/option-editor";
import {
  describePricingModel,
  formatMinorMoney,
  type PricingModel,
} from "@/features/guest-services/pricing";

export const metadata = { title: "Edit service" };
export const dynamic = "force-dynamic";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [service, categories, projects, villas] = await Promise.all([
    getServiceById(id),
    listCategories(),
    listProjects(),
    listVillas(),
  ]);
  if (!service) notFound();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest services", href: "/dashboard/guest-services" },
          { label: "Catalog", href: "/dashboard/guest-services/catalog" },
          { label: service.name },
        ]}
        title={service.name}
        description={`${service.serviceKey} · ${describePricingModel(service.pricingModel as PricingModel)} · ${
          service.pricingModel === "quote_required"
            ? "On request"
            : formatMinorMoney(service.basePriceMinor, service.currency)
        }`}
        actions={
          <Badge
            tone={
              service.status === "active"
                ? "success"
                : service.status === "paused"
                  ? "warning"
                  : "neutral"
            }
          >
            {service.status}
          </Badge>
        }
      />
      <Section eyebrow="Edit" title="Service details">
        <ServiceEditorForm
          service={service}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          villas={villas.map((v) => ({
            id: v.id,
            unitCode: v.unitCode,
            projectName: v.projectName,
          }))}
        />
      </Section>
      <Section
        eyebrow="Options"
        title={`${service.options.length} option${service.options.length === 1 ? "" : "s"}`}
        description="Each option adds (or subtracts) from the base price. Use them for variants like 60/90 min massages or 2/3-course menus."
      >
        <div className="flex flex-col gap-3">
          <OptionEditorForm serviceId={service.id} />
          {service.options.map((o) => (
            <OptionEditorForm
              key={o.id}
              serviceId={service.id}
              option={o}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
