import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { GuestForm } from "./form";

export const metadata = { title: "New guest" };

export default function NewGuestPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "Guests", href: "/dashboard/guests" },
          { label: "New" },
        ]}
        title="New guest"
        description="Guest contact records. Linked to bookings later; PII handling follows the visibility rules in DATABASE_SCHEMA.md §4.2."
      />
      <DbStatusNotice />
      <GuestForm />
    </div>
  );
}
