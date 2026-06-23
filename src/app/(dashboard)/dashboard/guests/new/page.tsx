import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { GuestForm } from "@/features/guests/form";

export const metadata = { title: "New guest" };

export default function NewGuestPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <Link href="/dashboard/guests">Guests</Link> / <span>New</span>
          </div>
          <h1>New guest</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Guest contact records. Linked to bookings later; PII handling follows the visibility rules in DATABASE_SCHEMA.md §4.2.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <GuestForm />
    </div>
  );
}
