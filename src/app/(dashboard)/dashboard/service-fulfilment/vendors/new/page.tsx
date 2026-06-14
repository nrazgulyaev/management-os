import Link from "next/link";
import { CreateVendorForm } from "@/components/service-fulfilment/create-vendor-form";

export const metadata = { title: "New vendor" };
export const dynamic = "force-dynamic";

export default function NewVendorPage() {
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/service-fulfilment">Service fulfilment</Link> /{" "}
            <Link href="/dashboard/service-fulfilment/vendors">Vendors</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New service vendor</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Register a new vendor. Map them to specific guest services on the vendor detail page.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Profile</div>
        <CreateVendorForm />
      </div>
    </div>
  );
}
