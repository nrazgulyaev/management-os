import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Star } from "lucide-react";
import { listGuests } from "@/features/guests/services";
import { canManageEntity } from "@/features/auth/permissions";
import { VipToggle } from "@/components/guests/vip-toggle";
import { GuestsRowActions } from "@/components/guests/guests-row-actions";

export const metadata = { title: "Guests" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "outline"> = {
  active: "success",
  archived: "outline",
};

export default async function GuestsPage() {
  const [guests, canManage] = await Promise.all([
    listGuests(),
    canManageEntity("guest"),
  ]);
  const source = guests[0]?.source ?? "mock";

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> / <span>Guests</span>
          </div>
          <h1>Guests</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Stored guest contact records. Linked to bookings; PII is access-controlled.
          </p>
        </div>
        <div className="actions">
          <SourceBadge source={source} />
          {canManage && (
            <Link href="/dashboard/guests/new" className="btn btn-primary btn-sm">
              Add guest +
            </Link>
          )}
        </div>
      </div>

      <DbStatusNotice />

      <Card padding="none" overflowHidden>
        {guests.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">No guests yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Phone</th>
                <th scope="col">Nationality</th>
                <th scope="col">Language</th>
                <th scope="col">VIP</th>
                <th scope="col">Status</th>
                {canManage && (
                  <th scope="col" className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id}>
                  <td className="row-title">{g.fullName}</td>
                  <td className="text-ink-secondary text-sm">{g.email ?? "—"}</td>
                  <td className="mono text-[12px] tabular-nums">
                    {g.phone ?? "—"}
                  </td>
                  <td className="text-ink-secondary">{g.nationality ?? "—"}</td>
                  <td className="text-ink-secondary">{g.preferredLanguage ?? "—"}</td>
                  <td>
                    {canManage && g.source === "db" ? (
                      <VipToggle guestId={g.id} initial={g.isVip} />
                    ) : g.isVip ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                        <Star className="size-3.5" fill="currentColor" strokeWidth={1.75} />
                        VIP
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[g.status] ?? "outline"}>
                      {g.status}
                    </Badge>
                  </td>
                  {canManage && (
                    <td className="text-right">
                      {g.source === "db" ? (
                        <GuestsRowActions
                          row={{
                            id: g.id,
                            fullName: g.fullName,
                            values: {
                              fullName: g.fullName,
                              email: g.email ?? "",
                              phone: g.phone ?? "",
                              nationality: g.nationality ?? "",
                              preferredLanguage: g.preferredLanguage ?? "",
                              whatsapp: g.whatsapp ?? "",
                              status: g.status,
                            },
                          }}
                          canWrite={canManage}
                        />
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
