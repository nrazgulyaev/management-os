import Link from "next/link";
import { notFound } from "next/navigation";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ChannelForm } from "../../new/form";
import { listBookingChannels } from "@/features/channels/services";

export const metadata = { title: "Edit channel" };
export const dynamic = "force-dynamic";

export default async function EditChannelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const channels = await listBookingChannels();
  const c = channels.find((x) => x.id === id);
  if (!c) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <Link href="/dashboard/channels">Channels</Link> / <span>{c.name}</span>
          </div>
          <h1>Edit channel</h1>
          <p className="text-[13px] text-ink-3 mt-2">
            Commission defaults apply to incoming bookings on this channel. The key is fixed.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <ChannelForm
        channel={{
          id: c.id,
          key: c.key,
          name: c.name,
          type: c.type,
          commissionModel: c.commissionModel,
          defaultCommissionPct: c.defaultCommissionPct,
          status: c.status,
        }}
      />
    </div>
  );
}
