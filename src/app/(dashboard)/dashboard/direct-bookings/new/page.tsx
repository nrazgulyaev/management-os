import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { requirePermission, AuthorizationError } from "@/features/auth/permissions";
import { AccessForbidden } from "@/components/auth/access-forbidden";
import { listVillas } from "@/features/villas/services";
import { CreateDirectBookingForm } from "./form";

export const metadata = { title: "New direct booking" };
export const dynamic = "force-dynamic";

export default async function NewDirectBookingPage() {
  try {
    await requirePermission("direct_booking.write");
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <div className="flex flex-col gap-8">
          <AccessForbidden
            backHref="/dashboard/direct-bookings"
            backLabel="Direct bookings"
          />
        </div>
      );
    }
    throw err;
  }
  const villas = await listVillas();
  const options = villas.map((v) => ({
    id: v.id,
    label: `${v.unitCode}${v.name ? ` · ${v.name}` : ""} — ${v.projectName}`,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <Link href="/dashboard/direct-bookings/holds">Holds</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New direct booking</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Place a commission-free hold for a guest who reached you off-platform
            (phone, WhatsApp, walk-in). The dates are priced live and blocked
            across every channel — no card is charged.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <CreateDirectBookingForm villas={options} />
    </div>
  );
}
