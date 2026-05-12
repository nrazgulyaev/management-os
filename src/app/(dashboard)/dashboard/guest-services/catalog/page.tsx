import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  listAllCatalogServices,
  listCategories,
} from "@/features/guest-services/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import {
  describePricingModel,
  formatMinorMoney,
  type PricingModel,
} from "@/features/guest-services/pricing";
import { ServiceAddButton } from "@/components/guest-services/service-add-button";

export const metadata = { title: "Guest services catalog" };
export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    categoryId?: string;
    search?: string;
  }>;
}) {
  const sp = await searchParams;
  const [services, categories, villas, projects] = await Promise.all([
    listAllCatalogServices({
      status:
        sp.status === "active" ||
        sp.status === "paused" ||
        sp.status === "archived"
          ? sp.status
          : undefined,
      categoryId: sp.categoryId || undefined,
      search: sp.search || undefined,
      limit: 500,
    }),
    listCategories({ includeArchived: false }),
    listVillas(),
    listProjects(),
  ]);
  const categoryOpts = categories.map((c) => ({ id: c.id, name: c.name }));
  const projectOpts = projects.map((p) => ({ id: p.id, name: p.name }));
  const villaOpts = villas.map((v) => ({
    id: v.id,
    unitCode: v.unitCode,
    projectName: v.projectName,
  }));
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest services", href: "/dashboard/guest-services" },
          { label: "Catalog" },
        ]}
        title="Catalog"
        description="Editable list of guest-facing services. Villa-scoped rows beat project-scoped rows; project-scoped rows beat global. Set guest_visible=false to hide a service without archiving it."
        actions={
          <ServiceAddButton
            categories={categoryOpts}
            projects={projectOpts}
            villas={villaOpts}
          />
        }
      />
      <Section eyebrow="Filter" title={`${services.length} services`}>
        <form className="flex flex-wrap items-end gap-3 mb-4" method="get">
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              Search
            </span>
            <input
              name="search"
              defaultValue={sp.search ?? ""}
              className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm"
              placeholder="airport transfer…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              Category
            </span>
            <select
              name="categoryId"
              defaultValue={sp.categoryId ?? ""}
              className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              Status
            </span>
            <select
              name="status"
              defaultValue={sp.status ?? ""}
              className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <button
            type="submit"
            className="h-10 px-4 rounded-full bg-ink text-ink-inverse text-sm font-medium"
          >
            Apply
          </button>
        </form>

        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Pricing</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Options</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {services.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-tertiary">
                    No services match these filters.
                  </td>
                </tr>
              )}
              {services.map((s) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="px-4 py-3">
                    <div className="text-ink font-medium">{s.name}</div>
                    <div className="text-[11px] text-ink-tertiary mt-0.5 font-mono">
                      {s.serviceKey} · {s.serviceType}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-tertiary text-xs">
                    {s.villaCode
                      ? `Villa ${s.villaCode}`
                      : s.projectName
                        ? `Project · ${s.projectName}`
                        : "Global"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {describePricingModel(s.pricingModel as PricingModel)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {s.pricingModel === "quote_required"
                      ? "—"
                      : formatMinorMoney(s.basePriceMinor, s.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        s.status === "active"
                          ? "success"
                          : s.status === "paused"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {s.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">{s.optionCount}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/guest-services/catalog/${s.id}`}
                      className="text-xs text-ink hover:underline underline-offset-4"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
