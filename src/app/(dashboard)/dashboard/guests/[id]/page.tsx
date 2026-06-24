import Link from "next/link";
import { notFound } from "next/navigation";
import { DbStatusNotice } from "@/components/admin/db-status";
import { GuestForm } from "@/features/guests/form";
import { getGuestById } from "@/features/guests/services";
import { canManageEntity } from "@/features/auth/permissions";

export const metadata = { title: "Edit guest" };
export const dynamic = "force-dynamic";

export default async function EditGuestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // getGuestById is org-scoped (mig 0176) — a foreign guest id reads as null.
  const [guest, canManage] = await Promise.all([
    getGuestById(id),
    canManageEntity("guest"),
  ]);
  if (!guest) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <Link href="/dashboard/guests">Guests</Link> /{" "}
            <span>{guest.fullName}</span>
          </div>
          <h1>Edit guest</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Update guest contact details. Changes produce an audit event. PII is
            access-controlled per DATABASE_SCHEMA.md §4.2.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      {canManage ? (
        <GuestForm
          mode="edit"
          defaults={{
            id: guest.id,
            fullName: guest.fullName,
            email: guest.email,
            phone: guest.phone,
            nationality: guest.nationality,
            preferredLanguage: guest.preferredLanguage,
            whatsapp: guest.whatsapp,
            status: guest.status,
          }}
          cancelHref="/dashboard/guests"
        />
      ) : (
        <p className="text-[13px] text-ink-3 italic">
          You do not have permission to edit guests.
        </p>
      )}
    </div>
  );
}
