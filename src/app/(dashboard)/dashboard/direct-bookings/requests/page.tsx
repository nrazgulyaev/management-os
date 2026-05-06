import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listDirectBookingRequests } from "@/features/direct-booking/services";

export const metadata = { title: "Direct booking requests" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "info" | "success" | "warning" | "neutral" | "danger"> = {
  submitted: "info",
  under_review: "info",
  approved: "success",
  rejected: "warning",
  expired: "warning",
  cancelled: "neutral",
  converted: "success",
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
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          { label: "Requests" },
        ]}
        title="Direct booking requests"
        description="Guest-submitted booking requests, attached to a hold. Concierge approves manually."
      />
      <Section eyebrow="Catalog" title={`${rows.length} requests`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Villa</th>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-tertiary">
                    No requests match the filter.
                  </td>
                </tr>
              )}
              {rows.map(({ request, villaCode }) => (
                <tr key={request.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/dashboard/direct-bookings/requests/${request.id}`}
                      className="text-ink hover:underline underline-offset-4"
                    >
                      {request.requestCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs">{villaCode ?? "—"}</td>
                  <td className="px-4 py-3 text-sm">
                    {request.guestFirstName}
                    {request.guestLastName ? ` ${request.guestLastName.slice(0, 1)}.` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONES[request.status] ?? "neutral"}>
                      {request.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                    {request.createdAt.toISOString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
