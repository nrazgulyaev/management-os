import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { listDirectBookingRequests } from "@/features/direct-booking/services";

export const metadata = { title: "Direct booking requests" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "info" | "ok" | "warn" | "soft" | "danger"
> = {
  submitted: "info",
  under_review: "info",
  approved: "ok",
  rejected: "warn",
  expired: "warn",
  cancelled: "soft",
  converted: "ok",
};

export default async function DirectBookingRequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  type ReqStatus =
    | "submitted"
    | "under_review"
    | "approved"
    | "rejected"
    | "expired"
    | "cancelled"
    | "converted";
  const status = (sp.status as ReqStatus | undefined) || undefined;
  const rows = await listDirectBookingRequests({ status, limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <span>Requests</span>
          </div>
          <h1>Direct booking requests</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Guest-submitted booking requests, attached to a hold. Concierge
            approves manually.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">{`${rows.length} requests`}</div>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Villa</th>
              <th scope="col">Guest</th>
              <th scope="col">Status</th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-ink-3">
                  No requests match the filter.
                </td>
              </tr>
            )}
            {rows.map(({ request, villaCode }) => (
              <tr key={request.id}>
                <td className="mono text-[12px]">
                  <Link
                    href={`/dashboard/direct-bookings/requests/${request.id}`}
                    className="text-ink hover:text-terra"
                  >
                    {request.requestCode}
                  </Link>
                </td>
                <td className="text-[12px]">{villaCode ?? "—"}</td>
                <td className="row-title">
                  {request.guestFirstName}
                  {request.guestLastName ? ` ${request.guestLastName.slice(0, 1)}.` : ""}
                </td>
                <td>
                  <HandoffBadge tone={STATUS_TONES[request.status] ?? "soft"}>
                    {request.status.replace("_", " ")}
                  </HandoffBadge>
                </td>
                <td className="mono text-[11px] text-ink-3">
                  {request.createdAt.toISOString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
