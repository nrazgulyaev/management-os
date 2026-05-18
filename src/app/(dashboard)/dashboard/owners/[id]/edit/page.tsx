import { notFound } from "next/navigation";
import { SectionHeading } from "@/components/dashboard/primitives";
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
      <SectionHeading
        eyebrow={`Portfolio · owners · ${owner.displayName} · edit`}
        title={`Edit · ${owner.displayName}`}
        subtitle="Updates produce an audit event."
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
