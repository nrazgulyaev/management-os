import Link from "next/link";
import {
  Kpi,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import {
  getConciergeKpis,
  listConciergeSessionsForCabinet,
  listConciergeHandoffsForCabinet,
  listSafetyEventsForCabinet,
  listConciergeMemoryNotes,
} from "@/features/guest-ai-concierge/concierge-cabinet-queries";
import { ConciergeWorkspace } from "./_concierge-workspace";
import { ComingSoon } from "@/components/ui/state";

/**
 * Sprint TASK-6-DATA-PART-2 — Mgmt OS Concierge cabinet live wiring.
 *
 * Five mock arrays replaced with live reads in
 * `src/features/guest-ai-concierge/concierge-cabinet-queries.ts`.
 *
 * DEMO-2 doesn't seed concierge data — sessions / messages / handoffs
 * / safety events / memory all empty. The cabinet renders as a clear
 * "ready for guests to start messaging" state rather than synthetic
 * activity. Once guests message via WhatsApp / direct chat, every
 * panel populates automatically.
 */

export const metadata = { title: "Concierge AI" };
export const dynamic = "force-dynamic";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ConciergePage() {
  const [kpis, sessions, handoffs, safety, memory] = await Promise.all([
    getConciergeKpis().catch(() => null),
    listConciergeSessionsForCabinet(6).catch(() => []),
    listConciergeHandoffsForCabinet(5).catch(() => []),
    listSafetyEventsForCabinet(5).catch(() => []),
    listConciergeMemoryNotes().catch(() => []),
  ]);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Concierge AI</span>
          </div>
          <h1>Concierge AI</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[720px]">
            {kpis ? `${kpis.activeSessions} active · ${kpis.handoffsOpen} handoffs. ` : ""}
            Multilingual replies on WhatsApp, in-stay portal and email — escalates only
            what truly needs you, with an audit log per reply.
          </p>
        </div>
        <div className="actions">
          <ComingSoon note="Reusable reply templates (per-language canned responses the AI and staff can insert) are coming soon.">
            <span className="btn btn-secondary btn-sm">Templates</span>
          </ComingSoon>
          <Link
            href="/dashboard/concierge#memory"
            className="btn btn-secondary btn-sm"
          >
            Memory
          </Link>
          <Link
            href="/dashboard/guest-ai/handoffs"
            className="btn btn-primary btn-sm"
          >
            Review handoffs · {kpis?.handoffsOpen ?? 0}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Active sessions"
          value={kpis && kpis.activeSessions > 0 ? String(kpis.activeSessions) : "—"}
          sub={kpis && kpis.activeSessions > 0 ? "live" : "none active"}
          tone={kpis && kpis.activeSessions > 0 ? "success" : undefined}
        />
        <Kpi
          label="Messages · today"
          value={kpis && kpis.messagesToday > 0 ? String(kpis.messagesToday) : "—"}
          sub="across channels"
        />
        <Kpi
          label="Refusals · today"
          value={kpis && kpis.refusalsToday > 0 ? String(kpis.refusalsToday) : "—"}
          sub="safety_status flagged"
        />
        <Kpi
          label="Handoffs queued"
          value={kpis && kpis.handoffsOpen > 0 ? String(kpis.handoffsOpen) : "—"}
          sub={kpis && kpis.handoffsOpen > 0 ? "open" : "all clear"}
          tone={kpis && kpis.handoffsOpen > 0 ? "accent" : undefined}
        />
        <Kpi label="CSAT · 30d" value="—" sub="feedback collection coming soon" />
      </div>

      {/* 2-up: request inbox + live transcript with staff composer */}
      <ConciergeWorkspace sessions={sessions} />

      <h2 className="display text-[30px] mt-8 mb-3.5 font-normal">
        Handoffs needing <em>your eyes</em>
      </h2>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {handoffs.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No handoffs queued. Sessions that the AI cannot resolve surface
            here automatically with priority + assignment context.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Villa</th>
                <th scope="col">Guest</th>
                <th scope="col">What</th>
                <th scope="col">Priority</th>
                <th scope="col">Status</th>
                <th scope="col">Age</th>
              </tr>
            </thead>
            <tbody>
              {handoffs.map((h) => (
                <tr
                  key={h.id}
                  className={
                    h.priority === "urgent"
                      ? "bg-[rgba(196,88,60,0.04)]"
                      : ""
                  }
                >
                  <td className="mono text-[11px] text-ink-3">
                    {h.sessionId ? h.sessionId.slice(0, 8) : "—"}
                  </td>
                  <td className="mono">{h.villaCode ?? "—"}</td>
                  <td>{h.guestName ?? "—"}</td>
                  <td className="max-w-[380px] text-[13px]">{h.summary}</td>
                  <td>
                    {h.priority === "urgent" ? (
                      <HandoffBadge tone="danger">Urgent</HandoffBadge>
                    ) : h.priority === "warn" ? (
                      <HandoffBadge tone="warn">Warn</HandoffBadge>
                    ) : (
                      <HandoffBadge>{h.priority}</HandoffBadge>
                    )}
                  </td>
                  <td>
                    <HandoffBadge>{h.status}</HandoffBadge>
                  </td>
                  <td className="mono">{fmtTime(h.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Safety events + Memory editor */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5 mb-[18px]">
        <Card padding="none" overflowHidden>
          <div className="px-[18px] py-3.5 border-b border-line-soft">
            <h3 className="display-sm">Safety events · last 24h</h3>
            <div className="label mt-1">
              Projected from message safety flags
            </div>
          </div>
          {safety.length === 0 ? (
            <p className="p-5 text-[13px] text-ink-3 italic m-0">
              No safety events. Anomalies (refused requests, sensitive
              disclosures, lock-attempt patterns) surface here in real time.
            </p>
          ) : (
            <ul className="clean p-0">
              {safety.map((e) => (
                <li key={e.id} className="px-[18px] py-3">
                  <span
                    className={
                      "w-2 h-2 rounded-full " +
                      (e.riskLevel === "warn" ? "bg-[var(--warn)]" : "bg-ink-3")
                    }
                  />
                  <div className="flex-1">
                    <div className="text-[13px] font-medium">{e.eventLabel}</div>
                    <div className="mono text-[10.5px] text-ink-4">
                      {e.villaCode ?? "—"} · {fmtTime(e.occurredAt)}
                    </div>
                    <div className="text-[12px] text-ink-3 mt-0.5">{e.note}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card id="memory" className="p-5 bg-cream-warm border border-dashed border-line-strong scroll-mt-24">
          <div className="label label-amber">AI Memory · written by AI</div>
          <h3 className="display-sm mt-1 mb-2">Recalled per-guest facts</h3>
          {memory.length === 0 ? (
            <p className="text-[13px] text-ink-3 italic m-0 mb-3.5">
              Once concierge sessions start producing facts (allergies,
              preferences, smart-lock notes), they surface here for review +
              editing.
            </p>
          ) : (
            <ul className="clean p-0 mb-3.5">
              {memory.map((m) => (
                <li key={m.id} className="py-2 text-[13px]">
                  • {m.fact}
                </li>
              ))}
            </ul>
          )}
          <ComingSoon note="Editing recalled per-guest facts (add / correct / forget) needs a write-back model — coming soon. Until then this list is read-only.">
            <span className="btn btn-secondary btn-sm">Open memory editor</span>
          </ComingSoon>
        </Card>
      </div>
    </>
  );
}
