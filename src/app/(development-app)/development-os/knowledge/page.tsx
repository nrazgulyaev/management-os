import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { getDb } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";
import {
  listDrawings,
  listRecentDrawingRevisions,
} from "@/lib/development/server/drawings/drawing-queries";
import { listSpecifications } from "@/lib/development/server/specifications/specification-queries";
import { listMethodStatements } from "@/lib/development/server/method-statements/method-statement-queries";
import { listQualityStandards } from "@/lib/development/server/quality-standards/quality-standard-queries";

export const metadata = { title: "Development OS · Knowledge" };
export const dynamic = "force-dynamic";

type RevTone = "ok" | "warn" | "danger" | "info" | "ink";

function revisionTone(status: string): RevTone {
  switch (status) {
    case "approved":
    case "issued_for_construction":
      return "ok";
    case "for_review":
      return "warn";
    case "rejected":
      return "danger";
    case "superseded":
      return "ink";
    default:
      return "info";
  }
}

function revisionLabel(status: string): string {
  switch (status) {
    case "issued_for_construction":
      return "Issued for construction";
    case "approved":
      return "Approved";
    case "for_review":
      return "Under review";
    case "rejected":
      return "Rejected";
    case "superseded":
      return "Superseded";
    case "draft":
      return "Draft";
    default:
      return status;
  }
}

const WHEN_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function DevKnowledgePage() {
  const db = getDb();

  const [drawingRows, specRows, methodRows, qualityRows, recentRevs] =
    db
      ? await Promise.all([
          safeQuery("knowledge.listDrawings", listDrawings(), [], 4000),
          safeQuery(
            "knowledge.listSpecifications",
            listSpecifications(),
            [],
            4000,
          ),
          safeQuery(
            "knowledge.listMethodStatements",
            listMethodStatements(),
            [],
            4000,
          ),
          safeQuery(
            "knowledge.listQualityStandards",
            listQualityStandards(),
            [],
            4000,
          ),
          safeQuery(
            "knowledge.listRecentDrawingRevisions",
            listRecentDrawingRevisions(8),
            [],
            4000,
          ),
        ])
      : [[], [], [], [], []];

  const approvedMethods = methodRows.filter(
    (m) => m.status === "approved",
  ).length;
  const methodSub =
    methodRows.length > 0 && approvedMethods === methodRows.length
      ? "all approved"
      : methodRows.length > 0
        ? `${approvedMethods} approved`
        : undefined;

  return (
    <>
      <SectionHeading
        eyebrow="Knowledge · drawings · specs · method statements"
        title="The source of truth for the jobsite."
        subtitle="Drawings with revision history, technical specifications, method statements library, quality standards."
        actions={
          <Link
            href="/development-os/drawings"
            className="btn btn-amber btn-sm"
          >
            + Drawing
          </Link>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi
          label="Drawings"
          value={String(drawingRows.length)}
          sub={
            recentRevs.length > 0
              ? `Rev ${recentRevs[0].revisionLabel} latest`
              : undefined
          }
        />
        <Kpi label="Specifications" value={String(specRows.length)} />
        <Kpi
          label="Method statements"
          value={String(methodRows.length)}
          sub={methodSub}
        />
        <Kpi label="Quality standards" value={String(qualityRows.length)} />
      </div>

      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        Recent drawing revisions
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Drawing</th>
              <th>Project</th>
              <th>Revision</th>
              <th>Status</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {recentRevs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "var(--ink-3)", fontStyle: "italic" }}>
                  No drawing revisions yet. Add a drawing, then upload Rev A on
                  its detail page.
                </td>
              </tr>
            ) : (
              recentRevs.map((r) => (
                <tr key={r.revisionId}>
                  <td>
                    <Link
                      href={`/development-os/drawings/${encodeURIComponent(r.drawingCode)}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      {r.drawingCode} · {r.drawingTitle}
                    </Link>
                  </td>
                  <td style={{ color: "var(--ink-3)" }}>
                    {r.projectName ?? "—"}
                  </td>
                  <td>REV {r.revisionLabel}</td>
                  <td>
                    <HandoffBadge tone={revisionTone(r.status)}>
                      {revisionLabel(r.status)}
                    </HandoffBadge>
                  </td>
                  <td style={{ color: "var(--ink-3)" }}>
                    {WHEN_FMT.format(r.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <p style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic", marginTop: 16 }}>
        Counts and recent revisions are live. Drill into{" "}
        <Link href="/development-os/drawings">Drawings</Link>,{" "}
        <Link href="/development-os/specifications">Specifications</Link>,{" "}
        <Link href="/development-os/method-statements">Method statements</Link>{" "}
        or{" "}
        <Link href="/development-os/quality-standards">Quality standards</Link>{" "}
        for the full libraries.
      </p>
    </>
  );
}
