/**
 * Sprint MD-1 — BoQ quick-entry route.
 *
 * Server page that loads BoQ documents + their sections + cost
 * categories, then mounts <BoqQuickEntryForm> wrapping
 * <SpreadsheetView>. Operator picks a target BoQ document at the
 * top (same pattern as bookkeeper's bank-account picker in Sprint 4),
 * then pastes or types lines with `sectionCode` as the per-row
 * dispatch key inside that document.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listBoqDocuments } from "@/lib/development/server/boq/boq-queries";
import { getCostCategories } from "@/lib/development/server/cost-categories";
import { safeQuery } from "@/lib/development/safe-query";
import { boqSections } from "@/lib/db/schema/boq";
import { asc, sql } from "drizzle-orm";
import {
  BoqQuickEntryForm,
  type BoqDocumentOption,
} from "./quick-entry-form";

export const metadata: Metadata = {
  title: "BoQ quick entry · Development OS",
};
export const dynamic = "force-dynamic";

export default async function BoqQuickEntryPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Construction · estimate</div>
            <h1>BoQ quick entry</h1>
          </div>
        </header>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to use the BoQ spreadsheet entry."
        />
      </DevelopmentShell>
    );
  }

  const [docs, categories] = await Promise.all([
    safeQuery("boq-documents", listBoqDocuments({ status: "under_review" }), []),
    safeQuery("cost-categories", getCostCategories(), []),
  ]);

  // For sections, fetch only those belonging to the available BoQ docs.
  const docIds = docs.map((d) => d.id);
  const sectionRows =
    docIds.length === 0
      ? []
      : await db
          .select({
            id: boqSections.id,
            boqDocumentId: boqSections.boqDocumentId,
            sectionCode: boqSections.sectionCode,
            sectionName: boqSections.sectionName,
          })
          .from(boqSections)
          .where(sql`${boqSections.boqDocumentId} = ANY(${docIds}::uuid[])`)
          .orderBy(asc(boqSections.displayOrder));

  const sectionsByDocId = new Map<
    string,
    Array<{ code: string; name: string }>
  >();
  for (const s of sectionRows) {
    const arr = sectionsByDocId.get(s.boqDocumentId) ?? [];
    arr.push({ code: s.sectionCode, name: s.sectionName });
    sectionsByDocId.set(s.boqDocumentId, arr);
  }

  const boqDocs: BoqDocumentOption[] = docs.map((d) => ({
    id: d.id,
    label: `${d.boqCode} · ${d.title}`,
    currency: d.currency,
    versionLabel: d.versionLabel,
    sectionCodes: sectionsByDocId.get(d.id) ?? [],
  }));

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/boq">BoQ</Link>
            <span>/</span>
            <span>Quick entry</span>
          </div>
          <h1>BoQ quick entry</h1>
        </div>
        <div className="actions">
          <Link href="/development-os/boq" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back to BoQ list
          </Link>
        </div>
      </header>

      <p className="text-ink-3 text-sm max-w-3xl -mt-4 leading-relaxed">
        Type or paste BoQ lines from your spreadsheet. Tab/Enter to move across
        cells; Ctrl/Cmd-S to save. Section code, item code, quantity, unit rate
        are required.
      </p>

      {boqDocs.length === 0 ? (
        <EmptyState
          title="No BoQ documents under review"
          description="Create a BoQ document and add at least one section before using quick entry."
          action={
            <Link href="/development-os/boq/new" className="btn btn-accent">
              New BoQ document
            </Link>
          }
        />
      ) : (
        <BoqQuickEntryForm
          boqDocuments={boqDocs}
          categoryNames={categories.map((c) => c.displayName)}
        />
      )}
    </DevelopmentShell>
  );
}
