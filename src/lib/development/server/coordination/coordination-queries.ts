import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { drawings, drawingRevisions } from "@/lib/db/schema/drawings";
import { rfis } from "@/lib/db/schema/rfis";
import { submittals } from "@/lib/db/schema/submittals";
import { qaQcIssues } from "@/lib/db/schema/qa-qc";
import { appUsers } from "@/lib/db/schema/identity";
import { contacts } from "@/lib/db/schema/contacts";
import {
  coordinationPins,
  coordinationMessages,
  type CoordinationItemKind,
} from "@/lib/db/schema/coordination";
import { rfiStatus } from "@/features/development/rfi/rfi-routing";
import {
  submittalStatusTone,
  type BadgeTone,
} from "@/features/development/coordination/coordination-model";
import {
  isActiveCoordinationStatus,
  type CoordinationItemRow,
} from "@/components/development/coordination/coordination-meta";
import type { SubmittalStatus } from "@/lib/db/schema/submittals";

/** Drawings (with their latest/IFC revision) available to pin against for a project. */
export interface CoordinationDrawingOption {
  drawingId: string;
  drawingCode: string;
  title: string;
  revisionId: string;
  revisionLabel: string;
  documentId: string;
}

/**
 * Lists the project's drawings that have at least one revision, returning the
 * "active" revision per drawing (IFC if present, else the most recent). The
 * Coordination split-view pins against this revision.
 */
export async function listProjectDrawingRevisions(
  projectId: string,
): Promise<CoordinationDrawingOption[]> {
  const db = requireDb();
  const rows = await db
    .select({
      drawingId: drawings.id,
      drawingCode: drawings.drawingCode,
      title: drawings.title,
      revisionId: drawingRevisions.id,
      revisionLabel: drawingRevisions.revisionLabel,
      revisionDate: drawingRevisions.revisionDate,
      status: drawingRevisions.status,
      documentId: drawingRevisions.documentId,
    })
    .from(drawings)
    .innerJoin(drawingRevisions, eq(drawingRevisions.drawingId, drawings.id))
    .where(and(eq(drawings.projectId, projectId), eq(drawings.isArchived, false)))
    .orderBy(asc(drawings.drawingCode), desc(drawingRevisions.revisionDate));

  // Pick one revision per drawing: IFC wins, else the first (newest) seen.
  const byDrawing = new Map<string, CoordinationDrawingOption>();
  for (const r of rows) {
    const existing = byDrawing.get(r.drawingId);
    const isIfc = r.status === "issued_for_construction";
    if (!existing || isIfc) {
      byDrawing.set(r.drawingId, {
        drawingId: r.drawingId,
        drawingCode: r.drawingCode,
        title: r.title,
        revisionId: r.revisionId,
        revisionLabel: r.revisionLabel,
        documentId: r.documentId,
      });
      // Once we've locked in the IFC revision, don't overwrite it.
      if (isIfc) continue;
    }
  }
  return [...byDrawing.values()];
}

/** Resolves a single revision option (for deep-linking ?revision=…). */
export async function getRevisionOption(
  revisionId: string,
): Promise<(CoordinationDrawingOption & { projectId: string }) | null> {
  const db = requireDb();
  const [row] = await db
    .select({
      drawingId: drawings.id,
      drawingCode: drawings.drawingCode,
      title: drawings.title,
      projectId: drawings.projectId,
      revisionId: drawingRevisions.id,
      revisionLabel: drawingRevisions.revisionLabel,
      documentId: drawingRevisions.documentId,
    })
    .from(drawingRevisions)
    .innerJoin(drawings, eq(drawings.id, drawingRevisions.drawingId))
    .where(eq(drawingRevisions.id, revisionId))
    .limit(1);
  return row ?? null;
}

function defectStatusTone(status: string): BadgeTone {
  switch (status) {
    case "accepted":
    case "closed":
      return "success";
    case "rejected":
      return "danger";
    case "ready_for_reinspection":
      return "info";
    case "open":
      return "warning";
    default:
      return "neutral";
  }
}

/**
 * Loads every coordination item for a project, joined to any pin on the given
 * revision. Items without a pin on this revision still appear in the registry
 * (pinId/x/y null) so an operator can place them.
 */
export async function listCoordinationItems(input: {
  projectId: string;
  revisionId: string;
}): Promise<{
  rfis: CoordinationItemRow[];
  submittals: CoordinationItemRow[];
  defects: CoordinationItemRow[];
}> {
  const db = requireDb();
  // TENANCY — scope the RFI/submittal registry reads to the caller's org
  // (in addition to project_id). Single-tenant today, so this hides nothing.
  const organizationId = await requireOrgId();

  // Pins on this revision → id maps per kind.
  const pins = await db
    .select()
    .from(coordinationPins)
    .where(eq(coordinationPins.revisionId, input.revisionId));

  const pinByRfi = new Map<string, (typeof pins)[number]>();
  const pinBySubmittal = new Map<string, (typeof pins)[number]>();
  const pinByDefect = new Map<string, (typeof pins)[number]>();
  for (const p of pins) {
    if (p.rfiId) pinByRfi.set(p.rfiId, p);
    else if (p.submittalId) pinBySubmittal.set(p.submittalId, p);
    else if (p.defectId) pinByDefect.set(p.defectId, p);
  }

  const [rfiRows, submittalRows, defectRows] = await Promise.all([
    db
      .select({
        id: rfis.id,
        ref: rfis.ref,
        question: rfis.question,
        discipline: rfis.discipline,
        openedAt: rfis.openedAt,
        respondedAt: rfis.respondedAt,
        resolvedAt: rfis.resolvedAt,
        // Ball-in-court: the contact the RFI is routed to (rfis carries no
        // assignee column of its own).
        routedToName: contacts.fullName,
      })
      .from(rfis)
      .leftJoin(contacts, eq(contacts.id, rfis.routedToContactId))
      .where(
        and(
          eq(rfis.organizationId, organizationId),
          eq(rfis.projectId, input.projectId),
        ),
      )
      .orderBy(desc(rfis.openedAt)),
    db
      .select()
      .from(submittals)
      .where(
        and(
          eq(submittals.organizationId, organizationId),
          eq(submittals.projectId, input.projectId),
        ),
      )
      .orderBy(desc(submittals.createdAt)),
    db
      .select({
        id: qaQcIssues.id,
        issueCode: qaQcIssues.issueCode,
        title: qaQcIssues.title,
        status: qaQcIssues.status,
        severity: qaQcIssues.severity,
        deadlineAt: qaQcIssues.deadlineAt,
        reportedAt: qaQcIssues.reportedAt,
        assigneeName: appUsers.fullName,
      })
      .from(qaQcIssues)
      .leftJoin(appUsers, eq(appUsers.id, qaQcIssues.assignedTo))
      // TENANCY — org-scope the defect read like the rfi/submittal reads
      // above (qa_qc_issues carries organization_id since migration 0072).
      .where(
        and(
          eq(qaQcIssues.organizationId, organizationId),
          eq(qaQcIssues.projectId, input.projectId),
        ),
      )
      .orderBy(desc(qaQcIssues.reportedAt)),
  ]);

  const rfiItems: CoordinationItemRow[] = rfiRows.map((r) => {
    const status = rfiStatus(r);
    const pin = pinByRfi.get(r.id) ?? null;
    return {
      kind: "rfi",
      id: r.id,
      ref: r.ref,
      title: r.question,
      status,
      statusTone:
        status === "closed" ? "success" : status === "answered" ? "info" : "warning",
      discipline: r.discipline,
      pinId: pin?.id ?? null,
      xPct: pin?.xPct ?? null,
      yPct: pin?.yPct ?? null,
      createdAt: r.openedAt,
      assigneeName: r.routedToName,
      // rfis carries no due-date column.
      dueDate: null,
      severity: null,
      active: isActiveCoordinationStatus("rfi", status),
    };
  });

  const submittalItems: CoordinationItemRow[] = submittalRows.map((s) => {
    const pin = pinBySubmittal.get(s.id) ?? null;
    return {
      kind: "submittal",
      id: s.id,
      ref: s.ref,
      title: s.title,
      status: s.status,
      statusTone: submittalStatusTone(s.status as SubmittalStatus),
      discipline: s.discipline,
      pinId: pin?.id ?? null,
      xPct: pin?.xPct ?? null,
      yPct: pin?.yPct ?? null,
      createdAt: s.createdAt,
      // submittals carries neither an assignee/ball-in-court nor a due column.
      assigneeName: null,
      dueDate: null,
      severity: null,
      active: isActiveCoordinationStatus("submittal", s.status),
    };
  });

  const defectItems: CoordinationItemRow[] = defectRows.map((d) => {
    const pin = pinByDefect.get(d.id) ?? null;
    return {
      kind: "defect",
      id: d.id,
      ref: d.issueCode,
      title: d.title,
      status: d.status,
      statusTone: defectStatusTone(d.status),
      discipline: null,
      pinId: pin?.id ?? null,
      xPct: pin?.xPct ?? null,
      yPct: pin?.yPct ?? null,
      createdAt: d.reportedAt,
      assigneeName: d.assigneeName,
      dueDate: d.deadlineAt,
      severity: d.severity,
      active: isActiveCoordinationStatus("defect", d.status),
    };
  });

  return { rfis: rfiItems, submittals: submittalItems, defects: defectItems };
}

export interface CoordinationThreadMessage {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: Date;
}

/** Loads the reply thread for one coordination item, oldest first. */
export async function listThreadMessages(input: {
  kind: CoordinationItemKind;
  id: string;
}): Promise<CoordinationThreadMessage[]> {
  const db = requireDb();
  // TENANCY: scope by caller org so a foreign rfi/submittal/defect id returns
  // no thread (coordination_messages.organization_id is NOT NULL).
  const organizationId = await requireOrgId();
  const col =
    input.kind === "rfi"
      ? coordinationMessages.rfiId
      : input.kind === "submittal"
        ? coordinationMessages.submittalId
        : coordinationMessages.defectId;
  const rows = await db
    .select({
      id: coordinationMessages.id,
      body: coordinationMessages.body,
      authorName: coordinationMessages.authorName,
      createdAt: coordinationMessages.createdAt,
    })
    .from(coordinationMessages)
    .where(
      and(
        eq(col, input.id),
        eq(coordinationMessages.organizationId, organizationId),
      ),
    )
    .orderBy(asc(coordinationMessages.createdAt));
  return rows;
}

/** Used by the action layer to verify pinned items belong to the project. */
export async function pinExistsForRevision(input: {
  revisionId: string;
  ids: string[];
}): Promise<Set<string>> {
  if (input.ids.length === 0) return new Set();
  const db = requireDb();
  // TENANCY: scope by caller org (coordination_pins.organization_id NOT NULL).
  const organizationId = await requireOrgId();
  const rows = await db
    .select({ id: coordinationPins.id })
    .from(coordinationPins)
    .where(
      and(
        eq(coordinationPins.revisionId, input.revisionId),
        inArray(coordinationPins.id, input.ids),
        eq(coordinationPins.organizationId, organizationId),
      ),
    );
  return new Set(rows.map((r) => r.id));
}
