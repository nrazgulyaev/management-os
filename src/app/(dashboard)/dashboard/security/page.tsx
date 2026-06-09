import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { listSecurityCameraDevices } from "@/features/security/services";
import { listSecurityEventsForAdmin } from "@/features/security-baseline/mfa-services";
import { listRecentLoginAttempts } from "@/features/security-baseline/login-throttle";
import { safeList } from "@/features/system/db-health";
import { listOperationTasks } from "@/features/operations/services";
import { loadSecurityCopilotOutputs } from "@/lib/development/server/ai/security-copilot-queries";
import { mapPoolAll } from "@/lib/db/map-pool";
import { isAgentEnabledForCurrentOrg } from "@/features/ai-agents/is-agent-enabled-for-org";

/**
 * Mgmt-P3 · Security cabinet — pixel pass to `cabinets/mgmt-p3/Security
 * and System.html` (#s-security). Forest `gs-hero` glow band, a 4-up
 * `.kpi` strip (open incidents / camera health / patrols today / auth
 * events 7d), then the two-column split: the auth-event cadence
 * `gs-bars` mini chart + the `gs-tl` recent-events timeline. The camera
 * registry, login-attempt log and security-copilot tiles are preserved
 * below as design-system sections.
 *
 * Every fetch + derived metric is preserved from the prior award-lineage
 * surface; only the presentation is re-skinned to Layer B.
 */

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

const BAR_MAX_PX = 80;

type EvDot = "alert" | "warn" | "ok" | "";

function severityDot(severity: string): EvDot {
  switch (severity) {
    case "critical":
    case "high":
      return "alert";
    case "warning":
    case "medium":
      return "warn";
    case "info":
      return "ok";
    default:
      return "";
  }
}

function bucketLast7Days(
  rows: Array<string>,
  today: Date,
): Array<{ label: string; count: number; quiet: boolean }> {
  const counts = new Map<string, number>();
  for (const iso of rows) {
    if (!iso) continue;
    const k = iso.slice(0, 10);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: Array<{ label: string; count: number; quiet: boolean }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const n = counts.get(iso) ?? 0;
    out.push({
      label: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      count: n,
      quiet: n === 0,
    });
  }
  return out;
}

export default async function SecurityCabinetPage() {
  const now = new Date();
  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const [
    cameras,
    events,
    securityTasks,
    copilotOutputs,
    copilotEnabled,
    loginAttemptsRes,
  ] = await mapPoolAll([
    () => listSecurityCameraDevices(),
    () => listSecurityEventsForAdmin(50),
    () => listOperationTasks({ category: "security", limit: 100 }),
    () => loadSecurityCopilotOutputs({ limit: 3 }).catch(() => []),
    () => isAgentEnabledForCurrentOrg("security_copilot").catch(() => false),
    () => safeList("security.loginAttempts", () => listRecentLoginAttempts(50)),
  ] as const, 4);

  const loginAttempts = loginAttemptsRes.ok ? loginAttemptsRes.value : [];
  const since24 = now.getTime() - 24 * 86_400_000;
  const attempts24h = loginAttempts.filter(
    (a) => new Date(a.createdAt).getTime() >= since24,
  );
  const failedAttempts24h = attempts24h.filter((a) => !a.succeeded).length;

  const totalCameras = cameras.length;
  const activeCameras = cameras.filter((c) => c.status === "active").length;
  const cameraHealthPct =
    totalCameras > 0 ? Math.round((activeCameras / totalCameras) * 100) : 0;

  const openIncidents = securityTasks.filter(
    (t) => t.status !== "completed" && t.status !== "approved",
  ).length;

  const todayIso = now.toISOString().slice(0, 10);
  const todaysPatrols = securityTasks.filter(
    (t) => t.scheduledFor && t.scheduledFor.slice(0, 10) === todayIso,
  );
  const completedPatrols = todaysPatrols.filter(
    (t) => t.status === "completed" || t.status === "approved",
  ).length;
  const patrolPct =
    todaysPatrols.length > 0
      ? Math.round((completedPatrols / todaysPatrols.length) * 100)
      : 0;

  const eventsLast7Days = events.filter((e) => {
    const created = e.createdAt;
    if (!created) return false;
    const d = new Date(created);
    return now.getTime() - d.getTime() <= 7 * 86_400_000;
  });
  const eventsThisWeek = eventsLast7Days.length;
  const criticalEventsThisWeek = eventsLast7Days.filter(
    (e) => e.severity === "critical" || e.severity === "high",
  ).length;

  const dailyEvents = bucketLast7Days(
    events.map((e) => e.createdAt),
    now,
  );
  const peakCount = Math.max(1, ...dailyEvents.map((d) => d.count));

  const timelineEvents = events.slice(0, 6).map((e) => ({
    id: e.id,
    timestamp: e.createdAt
      ? new Date(e.createdAt).toISOString().slice(11, 16)
      : "—",
    dot: severityDot(e.severity),
    title: e.eventType.replaceAll("_", " "),
    meta: e.appUserId
      ? `user ${e.appUserId.slice(0, 8)}… · ${e.severity}`
      : `system · ${e.severity}`,
  }));

  return (
    <>
      <div className="gs-hero">
        <div className="glow" />
        <div className="lab">Security · cabinet</div>
        <h2>
          {firstName ? `${firstName}, site is ` : "Site is "}
          <em>quiet</em>
          {openIncidents > 0
            ? ` — ${openIncidents} event${openIncidents === 1 ? "" : "s"} need a look.`
            : " — nothing needs a look."}
        </h2>
      </div>

      <div className="gs-kpis">
        <Link href="/dashboard/security/events" className="kpi block">
          <div className="label">Open incidents</div>
          <div className="v">{openIncidents}</div>
          <div className="sub">{openIncidents === 0 ? "site quiet" : "need triage"}</div>
        </Link>
        <Link href="/dashboard/security/cameras" className="kpi ok block">
          <div className="label">Camera health</div>
          <div className="v">{totalCameras > 0 ? `${cameraHealthPct}%` : "—"}</div>
          <div className="sub">
            {totalCameras > 0
              ? `${activeCameras} of ${totalCameras} active`
              : "no cameras registered"}
          </div>
        </Link>
        <Link
          href="/dashboard/operations?category=security"
          className="kpi block"
        >
          <div className="label">Patrols today</div>
          <div className="v">{todaysPatrols.length > 0 ? `${patrolPct}%` : "—"}</div>
          <div className="sub">
            {todaysPatrols.length === 0
              ? "none scheduled"
              : `${completedPatrols} of ${todaysPatrols.length} done`}
          </div>
        </Link>
        <Link
          href="/dashboard/security/events"
          className={`kpi block${criticalEventsThisWeek > 0 ? " warn" : ""}`}
        >
          <div className="label">Auth events · 7d</div>
          <div className="v">{eventsThisWeek}</div>
          <div className="sub">
            {criticalEventsThisWeek > 0
              ? `${criticalEventsThisWeek} critical`
              : "within baseline"}
          </div>
        </Link>
      </div>

      <div className="gs-2col">
        <div className="card card-pad">
          <div className="gs-card-h">
            <h3>Auth-event cadence · 7d</h3>
            <span className="meta">
              {eventsThisWeek} EVENTS · {criticalEventsThisWeek} CRITICAL
            </span>
          </div>
          <div className="gs-bars">
            {dailyEvents.map((d, i) => (
              <div
                key={i}
                className={d.quiet ? "b q" : "b"}
                title={`${d.count} event${d.count === 1 ? "" : "s"}`}
              >
                <i
                  style={{
                    height: `${Math.max(
                      6,
                      Math.round((d.count / peakCount) * BAR_MAX_PX),
                    )}px`,
                  }}
                />
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="gs-card-h">
            <h3>Recent events</h3>
            <Link
              href="/dashboard/security/events"
              className="meta hover:underline"
            >
              ALL EVENTS →
            </Link>
          </div>
          {timelineEvents.length === 0 ? (
            <p className="text-[13px] text-ink-3 leading-relaxed">
              No security events logged yet. MFA enrolment + login
              throttling surface here as they happen.
            </p>
          ) : (
            <div className="gs-tl">
              {timelineEvents.map((e) => (
                <Link
                  key={e.id}
                  href="/dashboard/security/events"
                  className="ev hover:opacity-80"
                >
                  <span className="t">{e.timestamp}</span>
                  <span className={`d${e.dot ? ` ${e.dot}` : ""}`} />
                  <span>
                    <span className="ti block capitalize">{e.title}</span>
                    <span className="mn block">{e.meta}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="gs-2col mt-[18px]">
        <div className="card card-pad">
          <div className="gs-card-h">
            <h3>Login attempts · 24h</h3>
            <span className="meta">
              {attempts24h.length} ATTEMPT{attempts24h.length === 1 ? "" : "S"} ·{" "}
              {failedAttempts24h} FAILED
            </span>
          </div>
          {!loginAttemptsRes.ok ? (
            <p className="text-[13px] text-ink-3">
              {loginAttemptsRes.error?.kind === "missing_relation"
                ? "Migration pending — login-attempt log not yet provisioned."
                : "Could not load login attempts."}
            </p>
          ) : loginAttempts.length === 0 ? (
            <p className="text-[13px] text-ink-3">
              No login attempts on file. Successful + failed sign-ins surface
              here as they happen.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Email</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">IP hash</th>
                </tr>
              </thead>
              <tbody>
                {loginAttempts.slice(0, 6).map((a) => (
                  <tr key={a.id}>
                    <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                      {a.createdAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="text-[12px]">{a.emailNormalized ?? "—"}</td>
                    <td>
                      <span
                        className={`badge ${a.succeeded ? "badge-ok" : "badge-warn"}`}
                      >
                        {a.succeeded ? "ok" : "failed"}
                      </span>
                    </td>
                    <td className="mono text-[11px] text-ink-4">
                      {a.ipHash ? `${a.ipHash.slice(0, 8)}…` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-[11px] text-ink-4 leading-relaxed">
            IP + user-agent are stored as salted SHA-256 hashes; raw values
            never persist.{" "}
            <Link
              href="/dashboard/security/login-attempts"
              className="text-ink-3 hover:underline"
            >
              All attempts →
            </Link>
          </p>
        </div>

        <div className="card card-pad">
          <div className="gs-card-h">
            <h3>Camera registry</h3>
            <Link
              href="/dashboard/security/cameras"
              className="meta hover:underline"
            >
              ALL CAMERAS →
            </Link>
          </div>
          {cameras.length === 0 ? (
            <p className="text-[13px] text-ink-3">
              No cameras registered. Add one from the camera registry.
            </p>
          ) : (
            <ul className="clean">
              {cameras.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link
                    href="/dashboard/security/cameras"
                    className="flex items-center justify-between gap-3 w-full hover:opacity-80"
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="text-[13px] text-ink truncate">
                        {c.name}
                      </span>
                      <span className="mono text-[10.5px] text-ink-4">
                        {c.villaCode ?? c.projectName ?? "—"} · {c.locationLabel}
                      </span>
                    </span>
                    <span
                      className={`badge ${c.status === "active" ? "badge-ok" : "badge-soft"}`}
                    >
                      {c.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-ink-4 leading-relaxed">
            Registry only — the platform never streams video. Each entry links
            to the vendor app.
          </p>
        </div>
      </div>

      <div className="card card-pad mt-[18px]">
        <div className="gs-card-h">
          <h3>Security copilot</h3>
          <span className="meta inline-flex items-center gap-2">
            <span className="pulse-dot accent" aria-hidden />
            {copilotEnabled ? "ENABLED" : "DRY-RUN"}
          </span>
        </div>
        {!copilotEnabled ? (
          <Link
            href="/dashboard/settings/ai-agents/security_copilot"
            className="block hover:opacity-90"
          >
            <p className="text-[13px] text-ink-3 leading-relaxed max-w-[640px]">
              The security-copilot agent ships with a dry-run default. Wire a
              provider key to flip it live; the overnight incident brief surfaces
              here.
            </p>
            <Badge tone="outline" className="mt-3">
              Configure provider →
            </Badge>
          </Link>
        ) : copilotOutputs.length === 0 ? (
          <Link
            href="/dashboard/ai/jobs?agent=security_copilot"
            className="block hover:opacity-90"
          >
            <p className="text-[13px] text-ink-3 leading-relaxed max-w-[640px]">
              Trigger the security-copilot to brief the supervisor on overnight
              incidents and patrol gaps.
            </p>
            <Badge tone="outline" className="mt-3">
              Run copilot →
            </Badge>
          </Link>
        ) : (
          <ul className="clean">
            {copilotOutputs.map((o) => (
              <li key={o.id}>
                <Link
                  href="/dashboard/ai"
                  className="flex flex-col gap-1 w-full hover:opacity-80"
                >
                  <span className="mono text-[10.5px] uppercase tracking-[0.04em] text-ink-4">
                    {new Date(o.createdAt).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "numeric",
                    })}
                  </span>
                  <span className="text-[13.5px] text-ink line-clamp-2">
                    {o.title}
                  </span>
                  <span className="text-[12px] text-ink-3 leading-relaxed line-clamp-2">
                    {o.summary}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
