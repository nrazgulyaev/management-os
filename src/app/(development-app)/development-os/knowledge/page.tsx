import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
      return "Approved · IFC";
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

  const [drawingRows, specRows, methodRows, qualityRows, recentRevs] = db
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
    (m) => m.status === "approved" || m.status === "active",
  ).length;
  const methodSub =
    methodRows.length > 0 && approvedMethods === methodRows.length
      ? "all approved"
      : methodRows.length > 0
        ? `${approvedMethods} approved`
        : "method statements";

  const tiles: Array<{
    href: string;
    icon: React.ReactNode;
    value: number;
    label: string;
    sub: string;
  }> = [
    {
      href: "/development-os/drawings",
      icon: (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M4 4h16v16H4z" />
          <path d="M4 9h16M9 9v11" />
        </svg>
      ),
      value: drawingRows.length,
      label: "Drawings",
      sub:
        recentRevs.length > 0
          ? `${recentRevs.length} revs latest`
          : "revision control",
    },
    {
      href: "/development-os/specifications",
      icon: (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M6 3h9l4 4v14H6z" />
          <path d="M14 3v5h5" />
        </svg>
      ),
      value: specRows.length,
      label: "Specifications",
      sub: "technical",
    },
    {
      href: "/development-os/method-statements",
      icon: (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M9 5h6M5 9h14v11H5z" />
          <path d="M9 13h6" />
        </svg>
      ),
      value: methodRows.length,
      label: "Method statements",
      sub: methodSub,
    },
    {
      href: "/development-os/quality-standards",
      icon: (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M12 3l8 4v5c0 4-3 7-8 9-5-2-8-5-8-9V7z" />
          <path d="M9.5 12l1.8 1.8L15 10" />
        </svg>
      ),
      value: qualityRows.length,
      label: "Quality standards",
      sub: "QA/QC",
    },
  ];

  return (
    <>
      <div className="flex items-end gap-[18px] mb-5">
        <div className="flex-1 min-w-0">
          <div className="label text-amber">
            Knowledge · drawings · specs · methods
          </div>
          <h1 className="display text-[42px] mt-1.5 mb-0 font-medium">
            The jobsite&rsquo;s <em>source of truth</em>.
          </h1>
          <p className="mt-2.5 mb-0 text-[15px] leading-[1.55] text-ink-3 max-w-[680px]">
            Drawings with revision history, technical specifications,
            method-statement library, and quality standards — one controlled
            vault.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/development-os/materials"
            className="btn btn-dark btn-sm"
          >
            Export ↓
          </Link>
          <Link
            href="/development-os/drawings"
            className="btn btn-amber btn-sm"
          >
            + Drawing
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-[18px]">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="card p-4 no-underline transition-colors hover:border-line-strong"
          >
            <span className="w-[34px] h-[34px] rounded-[9px] bg-muted text-amber inline-flex items-center justify-center mb-2.5">
              {t.icon}
            </span>
            <div className="mono text-[28px] text-ink leading-none">
              {t.value}
            </div>
            <div className="text-[13px] text-ink-2 mt-1">{t.label}</div>
            <div className="mono text-[11px] text-ink-4 mt-0.5">{t.sub}</div>
          </Link>
        ))}
      </div>

      <Card padding="none" overflowHidden>
        <div className="px-[22px] py-3.5 border-b border-line flex items-center">
          <h3 className="display text-[19px] font-medium m-0">
            Recent drawing revisions
          </h3>
          <span className="mono ml-auto text-[11px] text-ink-3">
            REVISION CONTROL
          </span>
        </div>
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
                <td colSpan={5} className="text-ink-3 italic">
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
                      className="no-underline text-inherit"
                    >
                      {r.drawingCode} · {r.drawingTitle}
                    </Link>
                  </td>
                  <td className="text-ink-3">{r.projectName ?? "—"}</td>
                  <td className="mono">REV {r.revisionLabel}</td>
                  <td>
                    <HandoffBadge tone={revisionTone(r.status)}>
                      {revisionLabel(r.status)}
                    </HandoffBadge>
                  </td>
                  <td className="text-ink-3">{WHEN_FMT.format(r.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-[12px] text-ink-3 italic mt-4">
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
