import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Concierge AI", href: "/dashboard/guest-ai" },
          { label: "Sessions" },
        ]}
        title="Sessions"
        description="Every session is bound to one stay token. Each row is one chat thread; archiving releases the slot for a fresh thread on the next visit."
      />
      <Section eyebrow="Filter" title={`${rows.length} sessions`}>
        <div className="flex gap-2 mb-4">
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
        <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Last</th>
                <th className="px-4 py-3">Messages</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No sessions match.
                  </td>
                </tr>
              )}
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs">
                    {s.tokenPrefix ? `${s.tokenPrefix}…` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {s.bookingCode ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={s.status === "active" ? "success" : "neutral"}
                    >
                      {s.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary tabular-nums">
                    {new Date(s.startedAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary tabular-nums">
                    {s.lastMessageAt
                      ? new Date(s.lastMessageAt)
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{s.messageCount}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/guest-ai/sessions/${s.id}`}
                      className="text-xs text-ink hover:underline underline-offset-4"
                    >
                      Open
                    </Link>
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
    <Link
      href={href}
      className={`h-8 px-3 inline-flex items-center rounded-full text-xs ${
        active
          ? "bg-ink text-ink-inverse"
          : "border border-line-soft text-ink-secondary hover:border-line-strong"
      }`}
    >
      {children}
    </Link>
  );
}
