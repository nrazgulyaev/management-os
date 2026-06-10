import type { Metadata } from "next";
import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  listBankConnectionsForUi,
  listStatementImportsForUi,
} from "@/lib/banking/queries";
import { CSV_TEMPLATES } from "@/lib/banking/templates/csv-templates";
import { StatementUploadForm } from "./_upload-form";

export const metadata: Metadata = { title: "Statement import · Finance" };
export const dynamic = "force-dynamic";

export default async function StatementImportPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/finance">Finance</Link> / Statement
              import
            </div>
            <h1>Statement import.</h1>
          </div>
        </div>
        <EmptyState
          title="Statement import runs against the database"
          description="Database connection not configured. Contact support."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      </DevelopmentShell>
    );
  }

  const [imports, allConnections] = await Promise.all([
    listStatementImportsForUi({ limit: 50 }),
    listBankConnectionsForUi(),
  ]);

  const connections = allConnections
    .filter((c) => c.status !== "archived")
    .map((c) => ({
      id: c.id,
      label: c.accountName ?? c.externalAccountId,
      provider: c.provider,
      currency: c.currency,
      status: c.status,
    }));

  const totals = imports.reduce(
    (acc, i) => ({
      created: acc.created + i.transactionsCreated,
      skipped: acc.skipped + i.transactionsSkippedDuplicate,
      failed: acc.failed + i.rowsFailed,
    }),
    { created: 0, skipped: 0, failed: 0 },
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> / Statement
            import
          </div>
          <h1>
            Statement import.{" "}
            <span className="text-[var(--amber)]">
              From bank file to matched lines.
            </span>
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Upload CSV / OFX / MT940 exports. Format and CSV columns
            auto-detect (Mandiri + BCA + generic templates bundled), rows
            commit with idempotent dedupe, then the auto-matcher runs so
            new lines land in the Bank ↔ GL matcher pre-scored.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/finance/bank-review"
            className="btn btn-secondary btn-sm"
          >
            Bank review
          </Link>
          <Link
            href="/development-os/finance/accounting"
            className="btn btn-secondary btn-sm"
          >
            Bank ↔ GL matcher →
          </Link>
        </div>
      </div>

      <div className="cfo-kpis">
        <Kpi
          label="Recent imports"
          value={String(imports.length)}
          sub="last 50 shown"
        />
        <Kpi
          label="Lines imported"
          value={totals.created.toLocaleString()}
          sub="across recent imports"
          tone="accent"
        />
        <Kpi
          label="Duplicates skipped"
          value={totals.skipped.toLocaleString()}
          sub="idempotent re-uploads"
        />
        <Kpi
          label="Rows failed"
          value={totals.failed.toLocaleString()}
          sub="see per-import error log"
        />
      </div>

      <StatementUploadForm
        connections={connections}
        csvTemplates={CSV_TEMPLATES.map((t) => ({ id: t.id, label: t.label }))}
      />

      <Card padding="default" className="mb-[18px]">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">Bundled CSV templates</h3>
          <span className="label">{CSV_TEMPLATES.length} templates</span>
        </div>
        <p className="cfo-card-sub mt-[6px] mb-[12px] max-w-[680px]">
          Pick one in the upload form when the auto-detector cannot read
          the bank&apos;s headers. Each template pins the column mapping,
          date format, and amount format for a known export schema.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Template</th>
              <th>Provider</th>
              <th>Default columns</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>
            {CSV_TEMPLATES.map((t) => (
              <tr key={t.id}>
                <td>
                  <div>{t.label}</div>
                  {t.description && (
                    <div className="text-[11px] text-[var(--ink-3)]">
                      {t.description}
                    </div>
                  )}
                </td>
                <td>
                  <HandoffBadge tone="info">{t.provider}</HandoffBadge>
                </td>
                <td className="mono text-[11px]">
                  {Object.entries(t.defaultMapping)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ")}
                </td>
                <td className="text-[12px]">
                  {t.defaultOptions?.defaultCurrency ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card padding="default">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">Recent imports</h3>
          <span className="label">latest {imports.length}</span>
        </div>
        <p className="cfo-card-sub mt-[6px] mb-[12px] max-w-[680px]">
          Idempotent — re-uploading the same file is safe (UNIQUE on
          bank_connection_id + external_transaction_id catches
          duplicates).
        </p>
        {imports.length === 0 ? (
          <EmptyState
            title="No imports yet"
            description="Upload a statement file above to begin — the first import appears here with its created/skipped/failed counts."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Format</th>
                <th>Filename</th>
                <th>Status</th>
                <th className="num">Created</th>
                <th className="num">Skipped</th>
                <th className="num">Failed</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id}>
                  <td className="mono text-[11px]">{i.importCode}</td>
                  <td>
                    <HandoffBadge tone="info">{i.format}</HandoffBadge>
                  </td>
                  <td className="text-[12px]">{i.filename ?? "—"}</td>
                  <td>
                    <HandoffBadge
                      tone={
                        i.status === "completed"
                          ? "ok"
                          : i.status === "failed" || i.status === "cancelled"
                            ? "danger"
                            : "warn"
                      }
                    >
                      {i.status}
                    </HandoffBadge>
                  </td>
                  <td className="num">{i.transactionsCreated}</td>
                  <td className="num">{i.transactionsSkippedDuplicate}</td>
                  <td className="num">{i.rowsFailed}</td>
                  <td className="text-[12px] text-[var(--ink-3)]">
                    {new Date(i.uploadedAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </DevelopmentShell>
  );
}
