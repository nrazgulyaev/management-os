import Link from "next/link";
import { notFound } from "next/navigation";
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
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-services">Guest services</Link> /{" "}
            <Link href="/dashboard/guest-services/catalog">Catalog</Link> /{" "}
            <span>{service.name}</span>
          </div>
          <h1>{service.name}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            {service.serviceKey} ·{" "}
            {describePricingModel(service.pricingModel as PricingModel)} ·{" "}
            {service.pricingModel === "quote_required"
              ? "On request"
              : formatMinorMoney(service.basePriceMinor, service.currency)}
          </p>
        </div>
        <div className="actions">
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
        </div>
      </div>

      <h2 className="display text-[22px] font-normal mb-3.5">Service details</h2>
      <div className="card px-5 py-[18px] mb-[18px]">
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
      </div>

      <div className="mt-8 mb-3.5">
        <h2 className="display text-[22px] font-normal">
          {service.options.length} option
          {service.options.length === 1 ? "" : "s"}
        </h2>
        <p className="text-[13px] text-ink-3 mt-1 max-w-[760px]">
          Each option adds (or subtracts) from the base price. Use them for
          variants like 60/90 min massages or 2/3-course menus.
        </p>
      </div>
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
    </>
  );
}
