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

const PHOTO_GRADIENTS = [
  "linear-gradient(135deg, #3a4250 0%, #1a1d22 100%)",
  "linear-gradient(135deg, #463826 0%, #1c1812 100%)",
  "linear-gradient(135deg, #5a6e7a 0%, #1c1812 100%)",
  "linear-gradient(135deg, #2c3848 0%, #15191e 100%)",
  "linear-gradient(135deg, #ddc4ab 0%, #806244 100%)",
];

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
  const [reports, photos, voiceNotes, inspections, incidents] = await Promise.all([
    listRecentSiteReports(5).catch(() => []),
    listRecentSitePhotos(10).catch(() => []),
    listVoiceNotes(6).catch(() => []),
    listQaInspections(6).catch(() => []),
    listSafetyIncidents(5).catch(() => []),
  ]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todaysPhotoCount = photos.filter((p) => p.reportDate === todayIso).length;
  const todaysReportCount = reports.filter((r) => r.reportDate === todayIso).length;

  return (
    <>
      <SectionHeading
        eyebrow="Site supervisor · daily report"
        title={
          <>
            Today&apos;s{" "}
            <span style={{ color: "var(--amber)" }}>jobsite log.</span>
          </>
        }
        subtitle="Daily report timeline, photo-evidence trail, geo-tagged completion stamps. Voice notes and offline-first PWA support coming soon."
        actions={
          <>
            <button className="btn btn-dark btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>Submit for sign-off</button>
            <button className="btn btn-amber btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>+ Photo</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
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
      <Card style={{ padding: 24, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <h2 className="display" style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>
            Daily reports · {reports.length === 0 ? "none yet" : `last ${reports.length}`}
          </h2>
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
          >
            {new Date().toLocaleDateString()}
          </span>
        </div>

        {reports.length === 0 ? (
          <p
            style={{
              marginTop: 18,
              fontSize: 13,
              color: "var(--ink-3)",
              fontStyle: "italic",
            }}
          >
            No site reports filed yet. Reports surface here once supervisors
            submit their first daily log.
          </p>
        ) : (
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "160px 1fr", gap: 14 }}>
            {reports.map((r) => (
              <React.Fragment key={r.id}>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", paddingTop: 4 }}>
                  {r.reportDate}
                </div>
                <div
                  style={{
                    padding: "10px 14px",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    background: "var(--bg-3)",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {r.projectCode ? `${r.projectCode} · ` : ""}
                    {r.summary ?? "Daily site report"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
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
                  <div style={{ marginTop: 8 }}>{statusBadge(r.status)}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </Card>

      {/* Photo evidence — live site_report_photos */}
      <Card style={{ padding: 20, marginBottom: 18 }}>
        <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
          Photo evidence · recent
        </h3>
        <div className="label" style={{ marginTop: 4 }}>
          Auto-uploaded · geo-tagged · linked to checklist items
        </div>
        {photos.length === 0 ? (
          <p
            style={{
              marginTop: 14,
              fontSize: 13,
              color: "var(--ink-3)",
              fontStyle: "italic",
            }}
          >
            No photos yet. Captures appear here once site reports include
            geo-tagged uploads.
          </p>
        ) : (
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 10,
            }}
          >
            {photos.map((p, i) => (
              <div
                key={p.id}
                style={{
                  aspectRatio: "4 / 3",
                  background: PHOTO_GRADIENTS[i % PHOTO_GRADIENTS.length],
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 9,
                    color: "rgba(255,255,255,0.55)",
                    letterSpacing: "0.08em",
                  }}
                >
                  {p.projectCode ?? p.reportDate}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>
                  {p.caption ?? "Site capture"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Voice notes — live from voice_notes (DEMO-3) */}
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
          <h2 className="display" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
            Voice notes · transcribed
          </h2>
          <div className="label label-amber" style={{ marginTop: 4 }}>
            FIELD AUDIO · AI-TRANSCRIBED
          </div>
        </div>
        {voiceNotes.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No voice notes yet. Supervisors capture audio in the field and the
            AI transcribes — entries appear here.
          </p>
        ) : (
          <ul className="clean" style={{ padding: "4px 0", margin: 0 }}>
            {voiceNotes.map((n) => (
              <li key={n.id} style={{ padding: "12px 22px", display: "flex", flexDirection: "column", gap: 4, borderBottom: "1px solid var(--line)" }}>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", display: "flex", gap: 8 }}>
                  <span>{n.projectCode ?? "—"}</span>
                  <span>·</span>
                  <span>{n.reporterName ?? "field"}</span>
                  {n.durationSeconds != null && <><span>·</span><span>{n.durationSeconds}s</span></>}
                  {n.transcriptLanguage && <><span>·</span><span>{n.transcriptLanguage.toUpperCase()}</span></>}
                  <span style={{ marginLeft: "auto" }}>
                    {new Date(n.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                <p style={{ margin: 0, fontFamily: "var(--font-space), sans-serif", fontStyle: "italic", fontSize: 13, color: "var(--ink)" }}>
                  &quot;{n.transcriptText ?? "—"}&quot;
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* QA inspections + Safety incidents — 2-up */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
            <h2 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
              QA · recent inspections
            </h2>
          </div>
          {inspections.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
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
                    <td style={{ maxWidth: 220, fontSize: 12 }}>{q.issueTitle}</td>
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

        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
            <h2 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
              Safety · recent incidents
            </h2>
          </div>
          {incidents.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
              No safety incidents recorded.
            </p>
          ) : (
            <ul className="clean" style={{ padding: "4px 0", margin: 0 }}>
              {incidents.map((s) => {
                const sevTone: "warn" | "danger" | undefined =
                  s.severity === "severe" || s.severity === "fatal"
                    ? "danger"
                    : s.severity === "moderate" || s.severity === "minor"
                      ? "warn"
                      : undefined;
                return (
                  <li key={s.id} style={{ padding: "12px 22px", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <HandoffBadge tone={sevTone}>{s.severity.replace(/_/g, " ")}</HandoffBadge>
                      <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
                        {s.category} · {s.incidentDate}
                      </span>
                      <span style={{ marginLeft: "auto" }}>
                        <HandoffBadge>{s.status}</HandoffBadge>
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.4 }}>
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
