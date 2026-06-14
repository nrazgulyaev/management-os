import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDocumentExtractions } from "@/lib/development/server/document-extraction-actions";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Document extractions · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "neutral" | "danger"
> = {
  pending_review: "info",
  approved: "success",
  edited_approved: "success",
  rejected: "warning",
  duplicate: "neutral",
  superseded: "neutral",
};

const QUALITY_TONE: Record<
  string,
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  high: "success",
  medium: "info",
  low: "warning",
  unreadable: "danger",
};

/** Map the legacy Badge tone vocabulary onto the handoff badge palette. */
const HANDOFF_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "soft"
> = {
  success: "ok",
  warning: "warn",
  danger: "danger",
  gold: "gold",
  info: "info",
  neutral: "soft",
};

export default async function DocumentExtractionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/finance">Finance</Link> /{" "}
              <span>Document extractions</span>
            </div>
            <h1>Document extractions</h1>
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              AI-extracted structured data from receipts, invoices, and delivery
              notes.
            </p>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const rows = await safeQuery(
    "getDocumentExtractions",
    getDocumentExtractions({
      status:
        sp.status &&
        [
          "pending_review",
          "approved",
          "edited_approved",
          "rejected",
          "duplicate",
        ].includes(sp.status)
          ? sp.status
          : undefined,
      documentType:
        sp.type &&
        ["receipt", "invoice", "delivery_note", "contract", "other"].includes(
          sp.type,
        )
          ? sp.type
          : undefined,
      limit: 200,
    }),
    [],
    4000,
  );

  const pending = rows.filter((r) => r.status === "pending_review").length;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>Document extractions</span>
          </div>
          <h1>Document extractions</h1>
          <div className="label mt-2">{`${rows.length} extractions · ${pending} awaiting review`}</div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            The AI agent extracts structured data from uploaded receipts,
            invoices, and delivery notes. Every extraction lands here for HITL
            review — nothing creates a transaction or delivery without your
            explicit approval.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/finance" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Finance
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <FilterPill href="/development-os/finance/document-extractions" active={!sp.status}>
          All
        </FilterPill>
        <FilterPill
          href="/development-os/finance/document-extractions?status=pending_review"
          active={sp.status === "pending_review"}
        >
          Pending review
        </FilterPill>
        <FilterPill
          href="/development-os/finance/document-extractions?status=approved"
          active={sp.status === "approved"}
        >
          Approved
        </FilterPill>
        <FilterPill
          href="/development-os/finance/document-extractions?status=rejected"
          active={sp.status === "rejected"}
        >
          Rejected
        </FilterPill>
        <FilterPill
          href="/development-os/finance/document-extractions?status=duplicate"
          active={sp.status === "duplicate"}
        >
          Duplicate
        </FilterPill>
      </div>

      <div>
        <div className="label mb-2.5">Inbox</div>
        {rows.length === 0 ? (
          <EmptyState
            title="No extractions yet"
            description="Upload a receipt or invoice and the AI will queue an extraction. You can also trigger one manually from a document detail page."

          action={
            <Link href="/dashboard/jobs" className="btn btn-secondary btn-sm">View jobs</Link>
          }
        />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Generated</TH>
                <TH>Document</TH>
                <TH>Type</TH>
                <TH>Lang</TH>
                <TH>Quality</TH>
                <TH>Vendor match</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs whitespace-nowrap">
                    {new Date(r.generatedAt)
                      .toISOString()
                      .slice(0, 19)
                      .replace("T", " ")}
                  </TD>
                  <TD className="text-sm">
                    <Link
                      href={`/development-os/finance/document-extractions/${r.id}`}
                      className="hover:underline"
                    >
                      {r.documentTitle || "(untitled)"}
                    </Link>
                  </TD>
                  <TD className="text-xs">{r.documentType}</TD>
                  <TD className="text-xs">{r.detectedLanguage ?? "—"}</TD>
                  <TD>
                    {r.detectedQuality ? (
                      <HandoffBadge tone={HANDOFF_TONE[QUALITY_TONE[r.detectedQuality] ?? "neutral"]}>
                        {r.detectedQuality}
                      </HandoffBadge>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-xs">
                    {r.vendorMatchConfidence != null
                      ? `${(Number(r.vendorMatchConfidence) * 100).toFixed(0)}%`
                      : "—"}
                  </TD>
                  <TD>
                    <HandoffBadge tone={HANDOFF_TONE[STATUS_TONE[r.status] ?? "neutral"]}>
                      {r.status}
                    </HandoffBadge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 ${active ? "bg-ink text-ink-inverse" : "border border-line-soft hover:bg-muted/40"}`}
    >
      {children}
    </Link>
  );
}
