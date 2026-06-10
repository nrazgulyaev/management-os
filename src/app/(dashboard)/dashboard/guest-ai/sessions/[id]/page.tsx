import Link from "next/link";
import { notFound } from "next/navigation";
import { Kpi } from "@/components/dashboard/primitives";
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
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <Link href="/dashboard/guest-ai">Concierge AI</Link> /{" "}
            <Link href="/dashboard/guest-ai/sessions">Sessions</Link> /{" "}
            <span>{session.tokenPrefix ?? session.id.slice(0, 8)}</span>
          </div>
          <h1>Session · {session.tokenPrefix ?? session.id.slice(0, 8)}…</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Booking {session.bookingCode ?? "—"} · {session.messageCount}{" "}
            messages
          </p>
        </div>
        <div className="actions">
          <Badge tone={session.status === "active" ? "success" : "neutral"}>
            {session.status}
          </Badge>
          {session.status === "active" && (
            <ArchiveSessionButton id={session.id} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi label="Input tokens" value={totalInputTokens.toLocaleString()} />
        <Kpi label="Output tokens" value={totalOutputTokens.toLocaleString()} />
        <Kpi
          label="Started"
          value={
            <span className="mono text-[15px]">
              {new Date(session.startedAt)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")}
            </span>
          }
        />
        <Kpi
          label="Last message"
          value={
            <span className="mono text-[15px]">
              {session.lastMessageAt
                ? new Date(session.lastMessageAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")
                : "—"}
            </span>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[18px]">
        <div className="lg:col-span-2 flex flex-col gap-[18px]">
          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              Transcript · {messages.length} entries
            </h2>
            <ol className="card p-0 overflow-hidden divide-y divide-[var(--line-soft,var(--line))]">
              {messages.length === 0 && (
                <li className="px-4 py-4 text-xs text-ink-4">
                  No messages yet.
                </li>
              )}
              {messages.map((m) => (
                <li key={m.id} className="px-4 py-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px] text-ink-4">
                    <span className="mono uppercase tracking-[0.16em]">
                      {m.role}
                    </span>
                    <span className="mono tabular-nums">
                      {new Date(m.createdAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">
                    {m.content}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-ink-4">
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
          </div>
        </div>

        <div className="flex flex-col gap-[18px]">
          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              Handoffs · {handoffs.length} from this session
            </h2>
            {handoffs.length === 0 ? (
              <p className="card px-4 py-3 text-xs text-ink-4">
                None yet.
              </p>
            ) : (
              <ol className="card p-0 overflow-hidden divide-y divide-[var(--line-soft,var(--line))]">
                {handoffs.map((h) => (
                  <li
                    key={h.id}
                    className="px-4 py-3 flex flex-col gap-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="mono text-[10px] text-ink-4">
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
                    <span className="text-ink-3">
                      {h.handoffType} · {h.guestSummary.slice(0, 80)}
                    </span>
                    <Link
                      href={`/dashboard/guest-ai/handoffs/${h.id}`}
                      className="text-xs hover:text-terra underline underline-offset-4 self-start"
                    >
                      Open →
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <h2 className="display text-[22px] font-normal mb-3.5">
              Runs · {runs.length} model runs
            </h2>
            <ol className="card p-0 overflow-hidden divide-y divide-[var(--line-soft,var(--line))]">
              {runs.length === 0 && (
                <li className="px-4 py-4 text-xs text-ink-4">
                  No runs yet.
                </li>
              )}
              {runs.map((r) => (
                <li key={r.id} className="px-4 py-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px] text-ink-4">
                    <span className="mono uppercase tracking-[0.16em]">
                      {r.status}
                    </span>
                    <span className="mono tabular-nums">
                      {new Date(r.startedAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </span>
                  </div>
                  <div className="text-xs text-ink-3">
                    {r.model ?? "—"}
                  </div>
                  {Array.isArray(r.allowedContextKeys) && (
                    <div className="mono text-[10px] text-ink-4">
                      keys:{" "}
                      {(r.allowedContextKeys as unknown[])
                        .filter((v): v is string => typeof v === "string")
                        .join(", ")}
                    </div>
                  )}
                  {r.errorMessage && (
                    <div className="text-[10px] text-[var(--danger)]">
                      {r.errorMessage.slice(0, 200)}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
