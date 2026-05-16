import * as React from "react";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";
import {
  listRecentSiteReports,
  listRecentSitePhotos,
} from "@/lib/development/server/cabinets/site-supervisor-cabinet-queries";

/**
 * Sprint TASK-7-DATA-PART-2 — Dev OS Site Supervisor cabinet live wiring.
 *
 * Visual port from `_handoff/development/site-supervisor.html` (TASK-7-
 * VISUAL, commit `316dc65`); this commit replaces two mock arrays with
 * live, org-scoped reads in
 * `src/lib/development/server/cabinets/site-supervisor-cabinet-queries.ts`:
 *
 *   - mockDIARY   → listRecentSiteReports(5)  (site_reports + reporter)
 *   - mockPHOTOS  → listRecentSitePhotos(10)  (geo-tagged photos)
 *
 * Voice-note panel stays mock copy — no `voice_notes` schema yet
 * (DEMO-2 dependency).
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
    return <Badge tone="warn">In progress</Badge>;
  if (s === "submitted" || s === "queued") return <Badge>Queued</Badge>;
  if (s === "approved" || s === "signed_off" || s === "done")
    return <Badge tone="ok">Done</Badge>;
  return <Badge>{status.replace(/_/g, " ")}</Badge>;
}

export default async function SiteSupervisorPage() {
  const [reports, photos] = await Promise.all([
    listRecentSiteReports(5).catch(() => []),
    listRecentSitePhotos(10).catch(() => []),
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
        subtitle="Daily report timeline, photo-evidence trail, geo-tagged completion stamps. Voice-note panel + offline-first PWA land once DEMO-2 schema seeds."
        actions={
          <>
            <button className="btn btn-dark btn-sm">Submit for sign-off</button>
            <button className="btn btn-amber btn-sm">+ Photo</button>
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
        <Kpi label="QA checks done" value="—" sub="qa_qc feed in PART-3" />
        <Kpi label="Safety incidents" value="—" sub="incident feed in PART-3" />
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

      {/* Voice note — placeholder, no schema yet */}
      <Card style={{ padding: 18, border: "1px dashed var(--line-2)" }}>
        <div className="label label-amber">VOICE NOTE · transcription deferred</div>
        <p
          style={{
            margin: "8px 0 0",
            fontFamily: "var(--font-space), sans-serif",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--ink-3)",
          }}
        >
          Voice-note capture + auto-transcription lands once the
          <span className="mono"> voice_notes </span>
          schema seeds in DEMO-2.
        </p>
      </Card>
    </>
  );
}
