import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
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
  const activeCount = services.filter((s) => s.status === "active").length;
  const pausedCount = services.filter((s) => s.status === "paused").length;
  const quoteCount = services.filter(
    (s) => s.pricingModel === "quote_required"
  ).length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-services">Guest services</Link> /{" "}
            <span>Catalog</span>
          </div>
          <h1>Catalog</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Editable list of guest-facing services. Villa-scoped rows beat
            project-scoped rows; project-scoped rows beat global. Set
            guest_visible=false to hide a service without archiving it.
          </p>
        </div>
        <div className="actions">
          <ServiceAddButton
            categories={categoryOpts}
            projects={projectOpts}
            villas={villaOpts}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi label="Services · in view" value={String(services.length)} sub={`${categories.length} categories`} />
        <Kpi
          label="Active"
          value={String(activeCount)}
          tone={activeCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Paused"
          value={String(pausedCount)}
          tone={pausedCount > 0 ? "warn" : undefined}
        />
        <Kpi label="Quote required" value={String(quoteCount)} sub="priced on request" />
      </div>

      <form className="flex flex-wrap items-end gap-3 mb-[14px]" method="get">
        <label className="field flex-1 min-w-[200px]">
          <span className="field-label">Search</span>
          <input
            name="search"
            defaultValue={sp.search ?? ""}
            className="input"
            placeholder="airport transfer…"
          />
        </label>
        <label className="field min-w-[160px]">
          <span className="field-label">Category</span>
          <select
            name="categoryId"
            defaultValue={sp.categoryId ?? ""}
            className="select"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field min-w-[140px]">
          <span className="field-label">Status</span>
          <select name="status" defaultValue={sp.status ?? ""} className="select">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button type="submit" className="btn btn-secondary">
          Apply
        </button>
      </form>

      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Scope</th>
              <th scope="col">Pricing</th>
              <th scope="col" className="num">Base</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">Options</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <TableEmpty colSpan={7}>No services match these filters.</TableEmpty>
            ) : (
              services.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="font-medium">{s.name}</div>
                    <div className="mono text-[11px] text-ink-4 mt-0.5">
                      {s.serviceKey} · {s.serviceType}
                    </div>
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {s.villaCode
                      ? `Villa ${s.villaCode}`
                      : s.projectName
                        ? `Project · ${s.projectName}`
                        : "Global"}
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {describePricingModel(s.pricingModel as PricingModel)}
                  </td>
                  <td className="num mono text-[12px]">
                    {s.pricingModel === "quote_required"
                      ? "—"
                      : formatMinorMoney(s.basePriceMinor, s.currency)}
                  </td>
                  <td>
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
                  <td className="num mono text-[12px]">{s.optionCount}</td>
                  <td className="num">
                    <Link
                      href={`/dashboard/guest-services/catalog/${s.id}`}
                      className="btn btn-ghost btn-sm"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
