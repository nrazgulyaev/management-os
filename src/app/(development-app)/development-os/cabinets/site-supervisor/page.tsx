import * as React from "react";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import {
  listRecentSiteReports,
  listRecentSitePhotos,
  listVoiceNotes,
  listQaInspections,
  listSafetyIncidents,
} from "@/lib/development/server/cabinets/site-supervisor-cabinet-queries";
import {
  listTodaysCaptureFrames,
  listActiveZones,
} from "@/lib/development/server/cabinets/site-supervisor-capture-actions";
import { CaptureConsole } from "./_capture-console";

/**
 * Sprint TASK-7-DATA-PART-2 — Dev OS Site Supervisor cabinet live wiring.
 *
 * Visual port from `_handoff/development/site-supervisor.html` (TASK-7-
 * VISUAL, commit `316dc65`); this commit replaces two mock arrays with
 * live, org-scoped reads in
 * `src/lib/development/server/cabinets/site-supervisor-cabinet-queries.ts`:
 *
 *   - mockDIARY      → listRecentSiteReports(5)   (site_reports + reporter)
 *   - mockPHOTOS     → listRecentSitePhotos(10)   (geo-tagged photos)
 *   - mockVOICE      → listVoiceNotes(6)          (voice_notes — DEMO-3 seeded 30)
 *   - mockQA         → listQaInspections(6)       (qa_qc_issues — DEMO-3 seeded 20)
 *   - mockINCIDENTS  → listSafetyIncidents(5)     (safety_incidents — DEMO-3 seeded 7)
 *
 * All 5 panels live as of TASK-7-DATA-PART-3 FINISH.
 */

export const metadata = { title: "Site Supervisor · Daily report" };
export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "draft" || s === "in_progress" || s === "in-progress")
    return <HandoffBadge tone="warn">In progress</HandoffBadge>;
  if (s === "submitted" || s === "queued") return <HandoffBadge>Queued</HandoffBadge>;
  if (s === "approved" || s === "signed_off" || s === "done")
    return <HandoffBadge tone="ok">Done</HandoffBadge>;
  return <HandoffBadge>{status.replace(/_/g, " ")}</HandoffBadge>;
}

export default async function SiteSupervisorPage() {
  const [reports, photos, voiceNotes, inspections, incidents, zones, captureFrames] =
    await Promise.all([
      listRecentSiteReports(5).catch(() => []),
      listRecentSitePhotos(10).catch(() => []),
      listVoiceNotes(6).catch(() => []),
      listQaInspections(6).catch(() => []),
      listSafetyIncidents(5).catch(() => []),
      listActiveZones().catch(() => []),
      listTodaysCaptureFrames(50).catch(() => []),
    ]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todaysPhotoCount = photos.filter((p) => p.reportDate === todayIso).length;
  const todaysReportCount = reports.filter((r) => r.reportDate === todayIso).length;
  const projectLabel = reports.find((r) => r.projectCode)?.projectCode ?? undefined;

  return (
    <>
      <SectionHeading
        eyebrow="Site supervisor · daily report"
        title={
          <>
            Today&apos;s <span className="text-amber">jobsite log.</span>
          </>
        }
        subtitle="Mobile field-capture: crew counter, active-zone chips, Photo / Incident / Voice capture, and an AI daily summary to the director. Read-only diary, QA and safety panels follow below."
        actions={
          <a href="#field-capture" className="btn btn-amber btn-sm">
            Open field capture
          </a>
        }
      />

      {/* Field-capture WRITE workflow (migration 0127). Mobile-first. */}
      <div id="field-capture" className="mb-[22px]">
        <CaptureConsole
          zones={zones}
          frames={captureFrames}
          projectLabel={projectLabel}
        />
      </div>

      <div className="grid grid-cols-5 gap-3 mb-[18px]">
        <Kpi
          label="Reports · today"
          value={todaysReportCount === 0 ? "—" : String(todaysReportCount)}
          sub={todaysReportCount === 0 ? "none filed yet" : "filed for today"}
        />
        <Kpi
          label="Reports · recent"
          value={reports.length === 0 ? "—" : String(reports.length)}
          sub="across all projects"
        />
        <Kpi
          label="Photos · today"
          value={todaysPhotoCount === 0 ? "—" : String(todaysPhotoCount)}
          sub={todaysPhotoCount === 0 ? "none captured yet" : "all geo-tagged"}
          tone={todaysPhotoCount > 0 ? "success" : undefined}
        />
        <Kpi label="QA checks done" value="—" sub="QA inspections coming soon" />
        <Kpi label="Safety incidents" value="—" sub="incident reporting coming soon" />
      </div>

      {/* Daily report timeline — live site_reports */}
      <Card className="p-6 mb-[18px]">
        <div className="flex items-baseline">
          <h2 className="display text-[22px] font-medium m-0">
            Daily reports · {reports.length === 0 ? "none yet" : `last ${reports.length}`}
          </h2>
          <span className="mono ml-auto text-[11px] text-ink-3">
            {new Date().toLocaleDateString()}
          </span>
        </div>

        {reports.length === 0 ? (
          <p className="mt-[18px] text-[13px] text-ink-3 italic">
            No site reports filed yet. Reports surface here once supervisors
            submit their first daily log.
          </p>
        ) : (
          <div className="mt-[18px] grid grid-cols-[160px_1fr] gap-3.5">
            {reports.map((r) => (
              <React.Fragment key={r.id}>
                <div className="mono text-[11px] text-ink-3 pt-1">
                  {r.reportDate}
                </div>
                <div className="px-3.5 py-2.5 border border-line rounded-[10px] bg-bg-3">
                  <div className="text-[14px] font-medium">
                    {r.projectCode ? `${r.projectCode} · ` : ""}
                    {r.summary ?? "Daily site report"}
                  </div>
                  <div className="text-[12px] text-ink-3 mt-0.5">
                    {r.reporterName ?? "—"}
                    {r.reporterRole ? ` · ${r.reporterRole}` : ""}
                    {r.workersPresent > 0 ? ` · ${r.workersPresent} workers` : ""}
                    {r.weatherConditions ? (
                      <>
                        {" "}
                        · <span className="mono">{r.weatherConditions}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-2">{statusBadge(r.status)}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </Card>

      {/* Photo evidence — live site_report_photos */}
      <Card className="p-5 mb-[18px]">
        <h3 className="display text-[18px] font-medium m-0">
          Photo evidence · recent
        </h3>
        <div className="label mt-1">
          Auto-uploaded · geo-tagged · linked to checklist items
        </div>
        {photos.length === 0 ? (
          <p className="mt-3.5 text-[13px] text-ink-3 italic">
            No photos yet. Captures appear here once site reports include
            geo-tagged uploads.
          </p>
        ) : (
          <div className="mt-3.5 grid grid-cols-5 gap-2.5">
            {photos.map((p) => (
              <div
                key={p.id}
                className="ss-photo-fill p-2.5 flex flex-col justify-between border border-line rounded-[10px] aspect-[4/3]"
              >
                <span className="mono text-[9px] tracking-[0.08em] text-white/55">
                  {p.projectCode ?? p.reportDate}
                </span>
                <span className="text-[11px] text-white/85">
                  {p.caption ?? "Site capture"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Voice notes — live from voice_notes (DEMO-3) */}
      <Card padding="none" overflowHidden className="mb-[18px]">
        <div className="px-[22px] py-3.5 border-b border-line">
          <h2 className="display text-[20px] font-medium m-0">
            Voice notes · transcribed
          </h2>
          <div className="label label-amber mt-1">
            FIELD AUDIO · AI-TRANSCRIBED
          </div>
        </div>
        {voiceNotes.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No voice notes yet. Supervisors capture audio in the field and the
            AI transcribes — entries appear here.
          </p>
        ) : (
          <ul className="clean py-1 m-0">
            {voiceNotes.map((n) => (
              <li
                key={n.id}
                className="px-[22px] py-3 flex flex-col gap-1 border-b border-line"
              >
                <div className="mono text-[10px] text-ink-3 flex gap-2">
                  <span>{n.projectCode ?? "—"}</span>
                  <span>·</span>
                  <span>{n.reporterName ?? "field"}</span>
                  {n.durationSeconds != null && <><span>·</span><span>{n.durationSeconds}s</span></>}
                  {n.transcriptLanguage && <><span>·</span><span>{n.transcriptLanguage.toUpperCase()}</span></>}
                  <span className="ml-auto">
                    {new Date(n.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                <p className="display m-0 italic text-[13px] text-ink">
                  &quot;{n.transcriptText ?? "—"}&quot;
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* QA inspections + Safety incidents — 2-up */}
      <div className="grid grid-cols-2 gap-3.5">
        <Card padding="none" overflowHidden>
          <div className="px-[22px] py-3.5 border-b border-line">
            <h2 className="display text-[18px] font-medium m-0">
              QA · recent inspections
            </h2>
          </div>
          {inspections.length === 0 ? (
            <p className="p-5 text-[13px] text-ink-3 italic m-0">
              No QA inspections logged yet.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Villa</th>
                  <th>Date</th>
                  <th>#</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((q) => (
                  <tr key={q.id}>
                    <td className="max-w-[220px] text-[12px]">{q.issueTitle}</td>
                    <td className="mono">{q.villaCode ?? "—"}</td>
                    <td className="mono">{q.inspectionDate}</td>
                    <td className="num">{q.inspectionNumber}</td>
                    <td>
                      <HandoffBadge tone={q.result === "passed" ? "ok" : q.result === "failed" ? "danger" : "warn"}>
                        {q.result.replace(/_/g, " ")}
                      </HandoffBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card padding="none" overflowHidden>
          <div className="px-[22px] py-3.5 border-b border-line">
            <h2 className="display text-[18px] font-medium m-0">
              Safety · recent incidents
            </h2>
          </div>
          {incidents.length === 0 ? (
            <p className="p-5 text-[13px] text-ink-3 italic m-0">
              No safety incidents recorded.
            </p>
          ) : (
            <ul className="clean py-1 m-0">
              {incidents.map((s) => {
                const sevTone: "warn" | "danger" | undefined =
                  s.severity === "severe" || s.severity === "fatal"
                    ? "danger"
                    : s.severity === "moderate" || s.severity === "minor"
                      ? "warn"
                      : undefined;
                return (
                  <li key={s.id} className="px-[22px] py-3 border-b border-line">
                    <div className="flex items-center gap-2 mb-1">
                      <HandoffBadge tone={sevTone}>{s.severity.replace(/_/g, " ")}</HandoffBadge>
                      <span className="mono text-[10px] text-ink-3">
                        {s.category} · {s.incidentDate}
                      </span>
                      <span className="ml-auto">
                        <HandoffBadge>{s.status}</HandoffBadge>
                      </span>
                    </div>
                    <p className="m-0 text-[12.5px] text-ink-2 leading-[1.4]">
                      {s.description}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
