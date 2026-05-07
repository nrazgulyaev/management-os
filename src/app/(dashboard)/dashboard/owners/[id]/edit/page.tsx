import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { OwnerForm } from "@/features/owners/form";
import { getOwnerById } from "@/features/owners/services";

export const metadata = { title: "Edit owner" };
export const dynamic = "force-dynamic";

export default async function EditOwnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const owner = await getOwnerById(id);
  if (!owner) notFound();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Owners", href: "/dashboard/owners" },
          { label: owner.displayName, href: `/dashboard/owners/${owner.id}` },
          { label: "Edit" },
        ]}
        title={`Edit · ${owner.displayName}`}
        description="Updates produce an audit event."
      />
      <DbStatusNotice />
      <OwnerForm
        mode="edit"
        defaults={{
          id: owner.id,
          type: owner.type,
          displayName: owner.displayName,
          legalName: owner.legalName,
          email: owner.email,
          phone: owner.phone,
          nationality: owner.nationality,
          taxResidency: owner.taxResidency,
          status: owner.status,
        }}
        cancelHref={`/dashboard/owners/${owner.id}`}
      />
    </div>
  );
}
