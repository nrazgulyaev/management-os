import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { OwnerForm } from "./form";

export const metadata = { title: "New owner" };

export default function NewOwnerPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Owners & investors", href: "/dashboard/owners" },
          { label: "New" },
        ]}
        title="New owner"
        description="Create an owner / investor record. KYC documents and ownership shares are added on the detail page."
      />
      <DbStatusNotice />
      <OwnerForm mode="create" />
    </div>
  );
}
