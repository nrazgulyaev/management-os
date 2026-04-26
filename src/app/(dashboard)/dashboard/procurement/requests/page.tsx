import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { RequestCard } from "@/components/procurement/request-card";
import { listPurchaseRequests } from "@/features/procurement/services";

export const metadata = { title: "Purchase requests" };
export const dynamic = "force-dynamic";

export default async function PurchaseRequestsPage() {
  const rows = await listPurchaseRequests();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Procurement", href: "/dashboard/procurement" },
          { label: "Requests" },
        ]}
        title="Purchase requests"
        description="Draft → submitted → approved → ordered."
        actions={
          <Button asChild>
            <Link href="/dashboard/procurement/requests/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New request
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No purchase requests yet.
          </p>
        ) : (
          rows.map((r) => (
            <RequestCard key={r.id} request={r} href={`/dashboard/procurement/requests/${r.id}`} />
          ))
        )}
      </div>
    </div>
  );
}
