import { SectionHeading } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { OwnerForm } from "./form";

export const metadata = { title: "New owner" };

export default function NewOwnerPage() {
  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Portfolio · owners · new"
        title="New owner"
        subtitle="Create an owner / investor record. KYC documents and ownership shares are added on the detail page."
      />
      <DbStatusNotice />
      <OwnerForm mode="create" />
    </div>
  );
}
