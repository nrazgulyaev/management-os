import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { listAdminSessions } from "@/features/guest-ai-concierge/services";

export const metadata = { title: "Concierge AI sessions" };
export const dynamic = "force-dynamic";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status =
    sp.status === "active" || sp.status === "archived" ? sp.status : undefined;
  const rows = await listAdminSessions({ status, limit: 200 });
  const activeCount = rows.filter((s) => s.status === "active").length;
  const totalMessages = rows.reduce((acc, s) => acc + s.messageCount, 0);
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <Link href="/dashboard/guest-ai">Concierge AI</Link> /{" "}
            <span>Sessions</span>
          </div>
          <h1>Sessions</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Every session is bound to one stay token. Each row is one chat
            thread; archiving releases the slot for a fresh thread on the next
            visit.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-[18px]">
        <Kpi label="Sessions · in view" value={String(rows.length)} />
        <Kpi
          label="Active"
          value={String(activeCount)}
          tone={activeCount > 0 ? "accent" : undefined}
        />
        <Kpi label="Messages" value={totalMessages.toLocaleString("en-US")} sub="across sessions in view" />
      </div>

      <div className="flex gap-2 mb-[14px]">
        <FilterPill href="/dashboard/guest-ai/sessions" active={!status}>
          All
        </FilterPill>
        <FilterPill
          href="/dashboard/guest-ai/sessions?status=active"
          active={status === "active"}
        >
          Active
        </FilterPill>
        <FilterPill
          href="/dashboard/guest-ai/sessions?status=archived"
          active={status === "archived"}
        >
          Archived
        </FilterPill>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Booking</th>
              <th scope="col">Status</th>
              <th scope="col">Started</th>
              <th scope="col">Last</th>
              <th scope="col" className="num">Messages</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={7}>No sessions match.</TableEmpty>
            ) : (
              rows.map((s) => (
                <tr key={s.id}>
                  <td className="mono text-[11px] text-ink-3">
                    {s.tokenPrefix ? `${s.tokenPrefix}…` : "—"}
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {s.bookingCode ?? "—"}
                  </td>
                  <td>
                    <Badge
                      tone={s.status === "active" ? "success" : "neutral"}
                    >
                      {s.status}
                    </Badge>
                  </td>
                  <td className="mono text-[11px] text-ink-4 tabular-nums">
                    {new Date(s.startedAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                  <td className="mono text-[11px] text-ink-4 tabular-nums">
                    {s.lastMessageAt
                      ? new Date(s.lastMessageAt)
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")
                      : "—"}
                  </td>
                  <td className="num mono text-[12px] tabular-nums">{s.messageCount}</td>
                  <td className="num">
                    <Link
                      href={`/dashboard/guest-ai/sessions/${s.id}`}
                      className="btn btn-ghost btn-sm"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={active ? "filter-chip on" : "filter-chip"}>
      {children}
    </Link>
  );
}
