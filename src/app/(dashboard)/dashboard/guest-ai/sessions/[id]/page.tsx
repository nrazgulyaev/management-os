import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getAdminSessionDetail } from "@/features/guest-ai-concierge/services";
import { listHandoffsForSession } from "@/features/guest-ai-concierge/handoff-services";
import { ArchiveSessionButton } from "@/components/guest-ai/handoff-actions-buttons";

export const metadata = { title: "Concierge AI session" };
export const dynamic = "force-dynamic";

const SAFETY_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  ok: "success",
  refused: "warning",
  redacted: "info",
  error: "danger",
};

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, handoffs] = await Promise.all([
    getAdminSessionDetail(id),
    listHandoffsForSession(id),
  ]);
  if (!detail.session) notFound();
  const { session, messages, runs } = detail;

  const totalInputTokens = messages.reduce(
    (acc, m) => acc + (m.inputTokens ?? 0),
    0,
  );
  const totalOutputTokens = messages.reduce(
    (acc, m) => acc + (m.outputTokens ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Concierge AI", href: "/dashboard/guest-ai" },
          {
            label: "Sessions",
            href: "/dashboard/guest-ai/sessions",
          },
          { label: session.tokenPrefix ?? session.id.slice(0, 8) },
        ]}
        title={`Session · ${session.tokenPrefix ?? session.id.slice(0, 8)}…`}
        description={`Booking ${session.bookingCode ?? "—"} · ${session.messageCount} messages`}
        actions={
          <div className="flex items-center gap-3">
            <Badge tone={session.status === "active" ? "success" : "neutral"}>
              {session.status}
            </Badge>
            {session.status === "active" && (
              <ArchiveSessionButton id={session.id} />
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Section eyebrow="Transcript" title={`${messages.length} entries`}>
            <ol className="rounded-3xl border border-line-soft bg-surface shadow-soft-card divide-y divide-line-soft">
              {messages.length === 0 && (
                <li className="px-4 py-4 text-xs text-ink-tertiary">
                  No messages yet.
                </li>
              )}
              {messages.map((m) => (
                <li key={m.id} className="px-4 py-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px] text-ink-tertiary">
                    <span className="uppercase tracking-widest">
                      {m.role}
                    </span>
                    <span className="tabular-nums">
                      {new Date(m.createdAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">
                    {m.content}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-ink-tertiary">
                    <Badge
                      tone={SAFETY_TONES[m.safetyStatus] ?? "neutral"}
                    >
                      {m.safetyStatus}
                    </Badge>
                    {m.model && <span>{m.model}</span>}
                    {m.latencyMs !== null && (
                      <span>· {m.latencyMs}ms</span>
                    )}
                    {m.inputTokens !== null && (
                      <span>
                        · {m.inputTokens}/{m.outputTokens ?? 0} tok
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section eyebrow="Metrics" title="At a glance">
            <dl className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 grid grid-cols-2 gap-4 text-sm">
              <Pair label="Total input tokens">
                {totalInputTokens.toLocaleString()}
              </Pair>
              <Pair label="Total output tokens">
                {totalOutputTokens.toLocaleString()}
              </Pair>
              <Pair label="Started">
                {new Date(session.startedAt)
                  .toISOString()
                  .slice(0, 16)
                  .replace("T", " ")}
              </Pair>
              <Pair label="Last message">
                {session.lastMessageAt
                  ? new Date(session.lastMessageAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")
                  : "—"}
              </Pair>
            </dl>
          </Section>

          <Section
            eyebrow="Handoffs"
            title={`${handoffs.length} created from this session`}
          >
            {handoffs.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-soft bg-muted/20 px-4 py-3 text-xs text-ink-tertiary">
                None yet.
              </p>
            ) : (
              <ol className="rounded-3xl border border-line-soft bg-surface shadow-soft-card divide-y divide-line-soft">
                {handoffs.map((h) => (
                  <li
                    key={h.id}
                    className="px-4 py-3 flex flex-col gap-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-ink-tertiary">
                        {new Date(h.createdAt)
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Badge
                          tone={
                            h.priority === "urgent"
                              ? "danger"
                              : h.priority === "high"
                                ? "warning"
                                : "info"
                          }
                        >
                          {h.priority}
                        </Badge>
                        <Badge
                          tone={
                            h.status === "resolved"
                              ? "success"
                              : h.status === "acknowledged"
                                ? "warning"
                                : "info"
                          }
                        >
                          {h.status.replace("_", " ")}
                        </Badge>
                      </span>
                    </div>
                    <span className="text-ink-secondary">
                      {h.handoffType} · {h.guestSummary.slice(0, 80)}
                    </span>
                    <Link
                      href={`/dashboard/guest-ai/handoffs/${h.id}`}
                      className="text-xs text-ink hover:underline underline-offset-4 self-start"
                    >
                      Open →
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section eyebrow="Runs" title={`${runs.length} model runs`}>
            <ol className="rounded-3xl border border-line-soft bg-surface shadow-soft-card divide-y divide-line-soft">
              {runs.length === 0 && (
                <li className="px-4 py-4 text-xs text-ink-tertiary">
                  No runs yet.
                </li>
              )}
              {runs.map((r) => (
                <li key={r.id} className="px-4 py-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px] text-ink-tertiary">
                    <span className="uppercase tracking-widest">
                      {r.status}
                    </span>
                    <span className="tabular-nums">
                      {new Date(r.startedAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </span>
                  </div>
                  <div className="text-xs text-ink-secondary">
                    {r.model ?? "—"}
                  </div>
                  {Array.isArray(r.allowedContextKeys) && (
                    <div className="text-[10px] text-ink-tertiary font-mono">
                      keys:{" "}
                      {(r.allowedContextKeys as unknown[])
                        .filter((v): v is string => typeof v === "string")
                        .join(", ")}
                    </div>
                  )}
                  {r.errorMessage && (
                    <div className="text-[10px] text-danger">
                      {r.errorMessage.slice(0, 200)}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Pair({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </dt>
      <dd className="text-ink mt-1 font-mono tabular-nums text-xs">
        {children}
      </dd>
    </div>
  );
}
