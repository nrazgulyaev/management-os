import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listStatementImportsForUi } from "@/lib/banking/queries";
import { CSV_TEMPLATES } from "@/lib/banking/templates/csv-templates";

export const metadata: Metadata = { title: "Statement import · Finance" };
export const dynamic = "force-dynamic";

export default async function StatementImportPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Statement import" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const imports = await listStatementImportsForUi({ limit: 50 });

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Statement import" },
        ]}
        eyebrow={`${imports.length} recent imports`}
        title="Statement import"
        description="Upload bank statements (CSV / OFX / PDF / MT940). The wizard auto-detects format + dialect, suggests column mappings (Mandiri + BCA + generic templates bundled), previews parsed rows, then commits in batches with idempotent dedupe."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/bank-review">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Bank review
            </Link>
          </Button>
        }
      />

      <Section
        title="Bundled CSV templates"
        description="Auto-applied when the operator picks a matching bank in the upload wizard. Operators can override any column on the review screen before committing."
      >
        <Table>
          <THead>
            <TR>
              <TH>Template</TH>
              <TH>Provider</TH>
              <TH>Default columns</TH>
              <TH>Currency</TH>
            </TR>
          </THead>
          <TBody>
            {CSV_TEMPLATES.map((t) => (
              <TR key={t.id}>
                <TD>
                  <div>{t.label}</div>
                  {t.description && (
                    <div className="text-[11px] text-ink-secondary">
                      {t.description}
                    </div>
                  )}
                </TD>
                <TD>
                  <Badge tone="outline">{t.provider}</Badge>
                </TD>
                <TD className="text-xs font-mono">
                  {Object.entries(t.defaultMapping)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ")}
                </TD>
                <TD className="text-xs">
                  {t.defaultOptions?.defaultCurrency ?? "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section
        title="Recent imports"
        description="Idempotent — re-uploading the same file is safe (UNIQUE on bank_connection_id + external_transaction_id catches duplicates)."
      >
        {imports.length === 0 ? (
          <EmptyState
            title="No imports yet"
            description="Upload a statement file via the wizard to begin. PDF imports of Mandiri / BCA exports apply the bundled regex templates from P3.B."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Format</TH>
                <TH>Filename</TH>
                <TH>Status</TH>
                <TH className="text-right">Created</TH>
                <TH className="text-right">Skipped</TH>
                <TH className="text-right">Failed</TH>
                <TH>Uploaded</TH>
              </TR>
            </THead>
            <TBody>
              {imports.map((i) => (
                <TR key={i.id}>
                  <TD className="font-mono text-xs">{i.importCode}</TD>
                  <TD>
                    <Badge tone="outline">{i.format}</Badge>
                  </TD>
                  <TD className="text-xs">{i.filename ?? "—"}</TD>
                  <TD>
                    <Badge
                      tone={
                        i.status === "completed"
                          ? "success"
                          : i.status === "failed" || i.status === "cancelled"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {i.status}
                    </Badge>
                  </TD>
                  <TD className="text-right tabular-nums">
                    {i.transactionsCreated}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {i.transactionsSkippedDuplicate}
                  </TD>
                  <TD className="text-right tabular-nums">{i.rowsFailed}</TD>
                  <TD className="text-xs text-ink-secondary">
                    {new Date(i.uploadedAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
