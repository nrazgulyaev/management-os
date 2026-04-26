import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listGuests } from "@/features/guests/services";

export const metadata = { title: "Guests" };
export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const guests = await listGuests();
  const source = guests[0]?.source ?? "mock";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "Guests" },
        ]}
        title="Guests"
        description="Stored guest contact records. Linked to bookings; PII is access-controlled."
        actions={<SourceBadge source={source} />}
      />

      <DbStatusNotice />

      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Phone</TH>
            <TH>Nationality</TH>
            <TH>Language</TH>
          </TR>
        </THead>
        <TBody>
          {guests.length === 0 ? (
            <TR>
              <TD colSpan={5} className="text-ink-tertiary text-center py-8">
                No guests yet.
              </TD>
            </TR>
          ) : (
            guests.map((g) => (
              <TR key={g.id}>
                <TD className="text-ink font-medium">{g.fullName}</TD>
                <TD className="text-ink-secondary text-sm">{g.email ?? "—"}</TD>
                <TD className="text-ink-secondary text-sm font-mono tabular-nums">
                  {g.phone ?? "—"}
                </TD>
                <TD className="text-ink-secondary">{g.nationality ?? "—"}</TD>
                <TD className="text-ink-secondary">{g.preferredLanguage ?? "—"}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
