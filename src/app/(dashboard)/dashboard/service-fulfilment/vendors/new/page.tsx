import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { CreateVendorForm } from "@/components/service-fulfilment/create-vendor-form";

export const metadata = { title: "New vendor" };
export const dynamic = "force-dynamic";

export default function NewVendorPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Service fulfilment", href: "/dashboard/service-fulfilment" },
          { label: "Vendors", href: "/dashboard/service-fulfilment/vendors" },
          { label: "New" },
        ]}
        title="New service vendor"
        description="Register a new vendor. Map them to specific guest services on the vendor detail page."
      />
      <Section eyebrow="Profile" title="Vendor details">
        <CreateVendorForm />
      </Section>
    </div>
  );
}
