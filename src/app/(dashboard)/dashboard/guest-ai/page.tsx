import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi, Pulse } from "@/components/dashboard/primitives";
import {
  countSessionsByStatus,
  listAdminSessions,
} from "@/features/guest-ai-concierge/services";
import { countHandoffsByStatus } from "@/features/guest-ai-concierge/handoff-services";
import { isAiConfigured, isAiDryRun } from "@/lib/env";

export const metadata = { title: "Guest concierge AI" };
export const dynamic = "force-dynamic";

function fmtWhen(iso: string | Date | null): string {
  if (!iso) return "—";
  return new Date(iso)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

export default async function GuestAIHub() {
  const [counts, recent, handoffCounts] = await Promise.all([
    countSessionsByStatus(),
    listAdminSessions({ limit: 10, status: "active" }),
    countHandoffsByStatus(),
  ]);
  const live = isAiConfigured() && !isAiDryRun();
  const openHandoffs =
    handoffCounts.created + handoffCounts.linked + handoffCounts.acknowledged;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <span>AI concierge</span>
          </div>
          <h1>What the agent is handling</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Per-stay read-only concierge embedded in /stay/[token]/concierge.
            Routine guest messages answered autonomously; anything sensitive
            ranks up for a human. We log every message, every refusal, every
            model call.
          </p>
        </div>
        <div className="actions">
          <span className="chip">
            <Pulse />
            concierge-handoff · {live ? "live" : "fallback"}
          </span>
          <Link
            href="/dashboard/guest-ai/handoffs"
            className="btn btn-secondary btn-sm"
          >
            Handoffs →
          </Link>
          <Link
            href="/dashboard/guest-ai/sessions"
            className="btn btn-accent btn-sm"
          >
            All sessions →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Active sessions"
          value={String(counts.active)}
          sub="across in-house stays"
          tone={counts.active > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Archived"
          value={String(counts.archived)}
          sub="closed transcripts"
        />
        <Kpi
          label="Refusals"
          value={String(counts.refused)}
          sub={counts.refused > 0 ? "all-time · logged" : "none logged"}
          tone={counts.refused > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Open handoffs"
          value={String(openHandoffs)}
          sub={
            handoffCounts.urgent > 0
              ? `${handoffCounts.urgent} urgent open`
              : "needs human"
          }
          tone={handoffCounts.urgent > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Mode"
          value={live ? "Live" : "Fallback"}
          sub={
            live
              ? "API key set · dry-run off"
              : "deterministic from villa data"
          }
          tone={live ? "success" : undefined}
        />
      </div>

      {/* Active sessions */}
      <div className="flex items-end justify-between mt-2 mb-3.5">
        <h2 className="display text-[22px] font-normal">
          Sessions · <em>active</em>
        </h2>
        <Link
          href="/dashboard/guest-ai/sessions"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All sessions →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Booking</th>
              <th scope="col">Last message</th>
              <th scope="col" className="num">Messages</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <TableEmpty colSpan={5}>
                No active concierge sessions yet. Guests open one from the
                in-stay concierge page.
              </TableEmpty>
            ) : (
              recent.map((s) => (
                <tr key={s.id}>
                  <td className="mono text-[11px] text-ink-3">
                    {s.tokenPrefix ? `${s.tokenPrefix}…` : "—"}
                  </td>
                  <td className="mono text-[11px]">{s.bookingCode ?? "—"}</td>
                  <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                    {fmtWhen(s.lastMessageAt)}
                  </td>
                  <td className="num mono text-[12px]">{s.messageCount}</td>
                  <td className="text-right">
                    <Link
                      href={`/dashboard/guest-ai/sessions/${s.id}`}
                      className="text-xs text-ink-secondary hover:text-terra"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Related surfaces */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
        {[
          {
            href: "/dashboard/guest-ai/sessions",
            title: "Sessions",
            detail: `${counts.active} active · full transcripts`,
          },
          {
            href: "/dashboard/guest-ai/handoffs",
            title: "Handoffs",
            detail: `${openHandoffs} open · human-in-the-loop`,
          },
          {
            href: "/dashboard/guest-ai/handoffs/metrics",
            title: "Handoff metrics",
            detail: "Response time + escalation rate",
          },
          {
            href: "/dashboard/guest-ai/storage",
            title: "Storage",
            detail: "Retention + model-call log",
          },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card p-4 block hover:border-line-strong transition-colors"
          >
            <div className="text-ink font-medium text-[14px]">{c.title}</div>
            <div className="text-[12px] text-ink-3 mt-1">{c.detail}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
