import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown, FileUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getBoqDocumentByCode } from "@/lib/development/server/boq/boq-queries";

export const metadata: Metadata = { title: "BOQ document · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  draft: "neutral",
  under_review: "info",
  approved: "success",
  tender: "info",
  awarded: "success",
  superseded: "neutral",
  archived: "neutral",
};

export default async function BoqDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="BOQ document" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getBoqDocumentByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { document, sections, items } = data;

  // Bucket items per section.
  const itemsBySection = new Map<string, typeof items>();
  for (const it of items) {
    const arr = itemsBySection.get(it.sectionId) ?? [];
    arr.push(it);
    itemsBySection.set(it.sectionId, arr);
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "BOQ", href: "/development-os/boq" },
          { label: document.boqCode },
        ]}
        eyebrow={`${document.versionLabel} · ${document.status}`}
        title={document.title}
        description={document.description ?? undefined}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link
                href={`/development-os/boq/${encodeURIComponent(document.boqCode)}/import`}
              >
                <FileUp className="w-4 h-4" strokeWidth={1.75} />
                Import CSV
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link
                href={`/development-os/boq/${encodeURIComponent(document.boqCode)}/export`}
              >
                <FileDown className="w-4 h-4" strokeWidth={1.75} />
                Export CSV
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/boq">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                All BOQ
              </Link>
            </Button>
          </div>
        }
      />

      <Section eyebrow="Header" title="Document metadata">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Code" value={document.boqCode} mono />
          <Field label="Status" value={document.status} />
          <Field label="Version" value={document.versionLabel} />
          <Field label="QS firm" value={document.qsFirm ?? "—"} />
          <Field label="Currency" value={document.currency} />
          <Field
            label="Total amount"
            value={
              document.totalAmountMinor != null
                ? `${(Number(document.totalAmountMinor) / 100).toLocaleString()} ${document.currency}`
                : "—"
            }
          />
        </div>
        <div className="mt-3">
          <Badge tone={STATUS_TONE[document.status] ?? "neutral"}>
            {document.status}
          </Badge>
        </div>
      </Section>

      {sections.length === 0 ? (
        <EmptyState
          title="No sections yet"
          description="Use 'Import CSV' to bulk-load sections + items, or add them via the API."
        />
      ) : (
        sections.map((s) => {
          const sectionItems = itemsBySection.get(s.id) ?? [];
          return (
            <Section
              key={s.id}
              eyebrow={s.sectionCode}
              title={`${s.sectionName} — subtotal ${
                s.subtotalMinor != null
                  ? `${(Number(s.subtotalMinor) / 100).toLocaleString()} ${document.currency}`
                  : "—"
              }`}
            >
              {sectionItems.length === 0 ? (
                <p className="text-xs text-ink-tertiary">No items in this section.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Item</TH>
                      <TH>Description</TH>
                      <TH>Qty</TH>
                      <TH>UoM</TH>
                      <TH>Unit rate</TH>
                      <TH>Total</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {sectionItems.map((it) => (
                      <TR key={it.id}>
                        <TD className="font-mono text-xs">{it.itemCode}</TD>
                        <TD className="text-sm">{it.description}</TD>
                        <TDNum>{Number(it.quantity).toFixed(2)}</TDNum>
                        <TD className="text-xs">{it.unitOfMeasure}</TD>
                        <TDNum>
                          {(Number(it.unitRateMinor) / 100).toLocaleString()}{" "}
                          {it.rateCurrency}
                        </TDNum>
                        <TDNum>
                          {it.totalMinor != null
                            ? (Number(it.totalMinor) / 100).toLocaleString()
                            : "—"}
                        </TDNum>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Section>
          );
        })
      )}
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
