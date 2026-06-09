import type { Metadata } from "next";
import Link from "next/link";
import { Layers } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { safeQuery } from "@/lib/development/safe-query";
import {
  listProjectDrawingRevisions,
  getRevisionOption,
  listCoordinationItems,
} from "@/lib/development/server/coordination/coordination-queries";
import { resolveRevisionImage } from "@/app/(development-app)/development-os/drawings/[code]/_resolve-revision-image";
import { CoordinationBoard } from "@/components/development/coordination/coordination-board";

export const metadata: Metadata = { title: "Coordination · Development OS" };
export const dynamic = "force-dynamic";

export default async function CoordinationPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; revision?: string }>;
}) {
  const sp = await searchParams;

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader
          eyebrow="Coordination"
          title="Coordination"
          description="RFIs, submittals, and punch-list pinned to a drawing."
        />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const projects = await safeQuery(
    "coordination.projects",
    getDevelopmentProjects(),
    [],
    4000,
  );
  const dbProjects = projects.filter((p) => p.source === "db");

  // ── No project selected → project picker ──
  const projectId = sp.project;
  const selected = projectId
    ? dbProjects.find((p) => p.realProjectId === projectId)
    : undefined;

  if (!selected) {
    return (
      <DevelopmentShell>
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "Coordination" },
          ]}
          eyebrow="Drawing-pinned coordination"
          title="Coordination"
          description="Pin RFIs, submittals, and punch-list defects directly onto a drawing revision. Pick a project to open its coordination board."
        />
        {dbProjects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Create a development project first, then upload a drawing revision to start pinning coordination items."
          />
        ) : (
          <Section eyebrow="Projects" title="Choose a project">
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {dbProjects.map((p) => (
                <li key={p.realProjectId}>
                  <Link
                    href={`/development-os/coordination?project=${p.realProjectId}`}
                    className="flex items-center gap-3 rounded-lg border border-line-soft bg-surface hover:bg-muted transition-colors px-4 py-3"
                  >
                    <Layers className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink truncate">
                        {p.name}
                      </div>
                      <div className="text-xs text-ink-tertiary truncate">
                        {p.location ?? p.slug}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </DevelopmentShell>
    );
  }

  // Project code for refs (slug, upper-cased downstream).
  const projectCode = selected.slug;

  // ── Drawings available to pin against ──
  const drawingOptions = await safeQuery(
    "coordination.drawings",
    listProjectDrawingRevisions(selected.realProjectId),
    [],
    4000,
  );

  // Resolve the active revision: ?revision=… (validated to project), else first.
  let activeRevisionId = sp.revision ?? drawingOptions[0]?.revisionId ?? null;
  if (sp.revision) {
    const opt = await getRevisionOption(sp.revision);
    if (!opt || opt.projectId !== selected.realProjectId) {
      activeRevisionId = drawingOptions[0]?.revisionId ?? null;
    }
  }
  const activeOption =
    drawingOptions.find((o) => o.revisionId === activeRevisionId) ?? null;

  const header = (
    <PageHeader
      breadcrumbs={[
        { label: "Development OS", href: "/development-os" },
        { label: "Coordination", href: "/development-os/coordination" },
        { label: selected.name },
      ]}
      eyebrow="Drawing-pinned coordination"
      title={`${selected.name} — Coordination`}
      description="Click the plan to drop a pin, then link an RFI / Submittal / Defect. Open any item for its reply thread + approve/close."
    />
  );

  if (!activeOption) {
    return (
      <DevelopmentShell>
        {header}
        <EmptyState
          title="No drawing revisions yet"
          description="Upload a drawing revision in the Drawings cabinet — then return here to pin coordination items on it."
        />
      </DevelopmentShell>
    );
  }

  const [image, items] = await Promise.all([
    safeQuery(
      "coordination.image",
      resolveRevisionImage(activeOption.documentId),
      null,
      6000,
    ),
    safeQuery(
      "coordination.items",
      listCoordinationItems({
        projectId: selected.realProjectId,
        revisionId: activeOption.revisionId,
      }),
      { rfis: [], submittals: [], defects: [] },
      6000,
    ),
  ]);

  const imageUrl = image?.isPdf ? null : (image?.url ?? null);
  const imageMissingNote = image?.isPdf
    ? "This revision is a PDF — raster preview is not yet supported. Pins are best placed on a raster (PNG/JPG) revision."
    : image?.missingFile
      ? "This revision has no stored image file yet."
      : null;

  const totalItems =
    items.rfis.length + items.submittals.length + items.defects.length;

  return (
    <DevelopmentShell>
      {header}

      {/* Drawing selector */}
      <Section eyebrow="Drawing" title="Pin against revision">
        <div className="flex items-center gap-2 flex-wrap">
          {drawingOptions.map((o) => (
            <Link
              key={o.revisionId}
              href={`/development-os/coordination?project=${selected.realProjectId}&revision=${o.revisionId}`}
            >
              <Badge tone={o.revisionId === activeOption.revisionId ? "accent" : "outline"}>
                {o.drawingCode} · {o.revisionLabel}
              </Badge>
            </Link>
          ))}
          <span className="text-xs text-ink-tertiary ml-2">
            {totalItems} coordination item{totalItems === 1 ? "" : "s"}
          </span>
        </div>
      </Section>

      <CoordinationBoard
        projectId={selected.realProjectId}
        projectCode={projectCode}
        revisionId={activeOption.revisionId}
        imageUrl={imageUrl}
        imageAlt={`${activeOption.drawingCode} ${activeOption.revisionLabel}`}
        imageMissingNote={imageMissingNote}
        items={items}
      />
    </DevelopmentShell>
  );
}
