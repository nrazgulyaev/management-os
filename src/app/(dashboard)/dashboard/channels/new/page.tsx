import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ChannelForm } from "./form";

export const metadata = { title: "New channel" };

export default function NewChannelPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "Channels", href: "/dashboard/channels" },
          { label: "New" },
        ]}
        title="New booking channel"
        description="Channels capture commission defaults applied to incoming bookings."
      />
      <DbStatusNotice />
      <ChannelForm />
    </div>
  );
}
