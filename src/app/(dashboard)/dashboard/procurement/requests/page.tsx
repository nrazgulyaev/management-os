import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DbStatusNotice } from "@/components/admin/db-status";
import { RequestCard } from "@/components/procurement/request-card";
import { PurchaseRequestAddButton } from "@/components/procurement/request-add-button";
import { listPurchaseRequests } from "@/features/procurement/services";
import { listSuppliers } from "@/features/inventory/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";
import { DashboardKpi, NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Purchase requests" };
export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "ordered", label: "Ordered" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function PurchaseRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status ?? "";

  // Always fetch the full set for KPI counts; filter client-side for the table.
  const [all, suppliers, projects, villas] = await Promise.all([
    listPurchaseRequests(),
    listSuppliers(),
    listProjects(),
    listVillas(),
  ]);
  const rows = statusFilter
    ? all.filter((r) => r.status === statusFilter)
    : all;
  const supplierOpts = suppliers.map((s) => ({ id: s.id, label: s.name }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));

  const kpiDraft = all.filter((r) => r.status === "draft").length;
  const kpiAwaiting = all.filter((r) => r.status === "submitted").length;
  const kpiApproved = all.filter((r) => r.status === "approved").length;
  const kpiOrdered = all.filter((r) => r.status === "ordered").length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Procurement", href: "/dashboard/procurement" },
          { label: "Requests" },
        ]}
        title="Purchase requests"
        description="Draft → submitted → approved → ordered. Approved requests can be promoted into a purchase order from the detail page."
        actions={
          <div className="flex gap-2">
            <PurchaseRequestAddButton
              suppliers={supplierOpts}
              projects={projectOpts}
              villas={villaOpts}
            />
            <Button asChild variant="secondary">
              <Link href="/dashboard/procurement">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Procurement
              </Link>
            </Button>
          </div>
        }
      />

      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpi
          label="Drafts"
          value={String(kpiDraft)}
          status={kpiDraft > 0 ? "warn" : "neutral"}
          hint="Not yet submitted for approval"
        />
        <DashboardKpi
          label="Awaiting approval"
          value={String(kpiAwaiting)}
          status={kpiAwaiting > 0 ? "bad" : "good"}
          hint="Submitted, decision required"
        />
        <DashboardKpi
          label="Approved"
          value={String(kpiApproved)}
          status="good"
          hint="Ready to convert to a PO"
        />
        <DashboardKpi
          label="Ordered"
          value={String(kpiOrdered)}
          status="neutral"
          hint="Closed PRs (lifetime)"
        />
      </div>

      <Section
        eyebrow="Filter"
        title={
          statusFilter
            ? `Showing ${statusFilter}`
            : "All purchase requests"
        }
      >
        <div className="flex flex-wrap gap-2 mb-4">
          {STATUS_FILTERS.map((f) => {
            const isActive = statusFilter === f.value;
            const href = f.value
              ? `/dashboard/procurement/requests?status=${encodeURIComponent(f.value)}`
              : "/dashboard/procurement/requests";
            return (
              <Link
                key={f.value || "all"}
                href={href}
                className={
                  "inline-flex items-center px-3 py-1.5 rounded-full text-xs border transition-colors " +
                  (isActive
                    ? "bg-ink text-ink-inverse border-ink"
                    : "border-line-soft text-ink-secondary hover:border-line-strong")
                }
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          {rows.length === 0 ? (
            all.length === 0 ? (
              <NoItemsYet
                entityLabel="purchase requests"
                description="A purchase request captures what you need + why. Submitted requests route to the approver; approved requests promote to a purchase order."
                addAction={
                  <Button asChild>
                    <Link href="/dashboard/procurement/requests/new">
                      <Plus className="w-4 h-4" strokeWidth={1.75} />
                      New request
                    </Link>
                  </Button>
                }
              />
            ) : (
              <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
                No purchase requests match the {statusFilter} filter.{" "}
                <Link
                  href="/dashboard/procurement/requests"
                  className="underline underline-offset-4"
                >
                  Clear filter
                </Link>
                .
              </p>
            )
          ) : (
            rows.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                href={`/dashboard/procurement/requests/${r.id}`}
              />
            ))
          )}
        </div>
      </Section>
    </div>
  );
}
