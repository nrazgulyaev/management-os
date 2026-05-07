import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Plus } from "lucide-react";
import { listBookings } from "@/features/bookings/services";

export const metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

const channelTone: Record<string, "accent" | "gold" | "info" | "neutral"> = {
  airbnb: "accent",
  booking: "gold",
  agoda: "gold",
  expedia: "gold",
  direct: "info",
  agent: "neutral",
  instagram_whatsapp: "neutral",
};

const statusTone: Record<string, "success" | "info" | "neutral" | "warning"> = {
  confirmed: "success",
  checked_in: "info",
  checked_out: "neutral",
  tentative: "warning",
  inquiry: "neutral",
  cancelled: "warning",
  no_show: "warning",
};

export default async function BookingsPage() {
  const bookings = await listBookings();
  const source = bookings[0]?.source ?? "mock";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Bookings" }]}
        title="Bookings"
        description="Manual reservations across the portfolio. Channel sync (Airbnb, Booking.com, Agoda, Expedia) lands in v8."
        actions={
          <div className="flex items-center gap-2">
            <SourceBadge source={source} />
            <Button asChild variant="secondary">
              <Link href="/dashboard/channels">Channels</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/bookings/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                Manual booking
              </Link>
            </Button>
          </div>
        }
      />

      <DbStatusNotice />

      <Table>
        <THead>
          <TR>
            <TH>Reference</TH>
            <TH>Villa</TH>
            <TH>Guest</TH>
            <TH>Channel</TH>
            <TH>Check-in</TH>
            <TH className="text-right">Nights</TH>
            <TH className="text-right">Gross</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {bookings.length === 0 ? (
            <TR>
              <TD colSpan={8} className="text-ink-tertiary text-center py-8">
                No bookings yet.
              </TD>
            </TR>
          ) : (
            bookings.map((b) => (
              <TR key={b.id}>
                <TD>
                  <Link
                    href={`/dashboard/bookings/${b.id}`}
                    className="font-mono text-xs text-ink hover:text-accent"
                  >
                    {b.bookingCode}
                  </Link>
                </TD>
                <TD className="font-mono text-xs text-ink-secondary">{b.villaCode}</TD>
                <TD className="text-ink">{b.guestName}</TD>
                <TD>
                  {b.channelKey ? (
                    <Badge tone={channelTone[b.channelKey] ?? "neutral"}>
                      {b.channelName ?? b.channelKey}
                    </Badge>
                  ) : (
                    <span className="text-ink-tertiary">—</span>
                  )}
                </TD>
                <TD className="text-ink-secondary tabular-nums text-xs">
                  {new Date(b.checkIn).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </TD>
                <TDNum>{b.nights}</TDNum>
                <TDNum>
                  {b.currency} {b.grossAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </TDNum>
                <TD>
                  <Badge tone={statusTone[b.status] ?? "neutral"}>
                    {b.status.replace("_", " ")}
                  </Badge>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
