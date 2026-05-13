import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import {
  countSessionsByStatus,
  listAdminSessions,
} from "@/features/guest-ai-concierge/services";
import { countHandoffsByStatus } from "@/features/guest-ai-concierge/handoff-services";
import { isAiConfigured, isAiDryRun } from "@/lib/env";

export const metadata = { title: "Guest concierge AI" };
export const dynamic = "force-dynamic";

export default async function GuestAIHub() {
  const [counts, recent, handoffCounts] = await Promise.all([
    countSessionsByStatus(),
    listAdminSessions({ limit: 10, status: "active" }),
    countHandoffsByStatus(),
  ]);
  const live = isAiConfigured() && !isAiDryRun();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Concierge AI" },
        ]}
        title="Concierge AI"
        description="Per-stay read-only concierge embedded in /stay/[token]/concierge. We log every message, every refusal, every model call."
      />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Active sessions" value={String(counts.active)} />
        <MetricCard label="Archived" value={String(counts.archived)} />
        <MetricCard
          label="Refusals (all-time)"
          value={String(counts.refused)}
          accent={counts.refused > 0}
        />
        <MetricCard
          label="Open handoffs"
          value={String(handoffCounts.created + handoffCounts.linked + handoffCounts.acknowledged)}
          hint={
            handoffCounts.urgent > 0
              ? `${handoffCounts.urgent} urgent open`
              : undefined
          }
          accent={handoffCounts.urgent > 0}
        />
        <MetricCard
          label="Mode"
          value={live ? "Live" : "Fallback"}
          hint={
            live
              ? "ANTHROPIC_API_KEY set, AI_DRY_RUN=0"
              : "Deterministic answers from villa data"
          }
        />
      </div>
      <Section
        eyebrow="Latest"
        title="Active sessions"
        description="Click through to view the full transcript and model metrics."
      >
        {recent.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            No active concierge sessions yet.
          </p>
        ) : (
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Booking</th>
                  <th className="px-4 py-3">Last message</th>
                  <th className="px-4 py-3">Messages</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 font-mono text-xs">
                      {s.tokenPrefix ? `${s.tokenPrefix}…` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {s.bookingCode ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-ink-tertiary tabular-nums">
                      {s.lastMessageAt
                        ? new Date(s.lastMessageAt)
                            .toISOString()
                            .slice(0, 16)
                            .replace("T", " ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {s.messageCount}
                    </td>
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
        )}
      </Section>
      <Section eyebrow="Browse" title="More">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/guest-ai/sessions"
            className="text-sm rounded-2xl border border-line-soft bg-surface p-4 shadow-soft-card hover:shadow-elevated-card hover:border-line-strong"
          >
            All sessions →
          </Link>
          <Link
            href="/dashboard/guest-ai/handoffs"
            className="text-sm rounded-2xl border border-line-soft bg-surface p-4 shadow-soft-card hover:shadow-elevated-card hover:border-line-strong"
          >
            All handoffs →
          </Link>
        </div>
      </Section>
    </div>
  );
}
