"use client";

/**
 * Statement-upload form — the client half of the import flow.
 *
 * Submits the picked file + connection + format to
 * `importStatementAction` and renders the honest result envelope
 * (created / duplicate / failed counts + per-line parse errors) with
 * links into the reconciliation surfaces.
 */

import * as React from "react";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  importStatementAction,
  type ImportStatementResult,
} from "./_actions";

export interface ConnectionOption {
  id: string;
  label: string;
  provider: string;
  currency: string;
  status: string;
}

export interface CsvTemplateOption {
  id: string;
  label: string;
}

export function StatementUploadForm({
  connections,
  csvTemplates,
}: {
  connections: ConnectionOption[];
  csvTemplates: CsvTemplateOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportStatementResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await importStatementAction(formData);
      setResult(res);
      if (res.ok) {
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    });
  };

  if (connections.length === 0) {
    return (
      <Card padding="default" className="mb-[18px]">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">Upload a statement</h3>
          <HandoffBadge tone="warn">No bank connections</HandoffBadge>
        </div>
        <p className="cfo-card-sub mt-[10px] max-w-[680px]">
          Imported lines attach to a bank connection
          (statement_imports.bank_connection_id is required). Create one
          first — a &quot;manual&quot; connection works for file-only
          banks with no API.
        </p>
        <div className="mt-[14px]">
          <Link
            href="/development-os/banking/new"
            className="btn btn-amber btn-sm"
          >
            + Add bank connection
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="default" className="mb-[18px]">
      <div className="cfo-card-head">
        <h3 className="cfo-card-title">Upload a statement</h3>
        <span className="label">CSV · OFX · MT940 · max 5 MB</span>
      </div>
      <p className="cfo-card-sub mt-[6px] mb-[14px] max-w-[680px]">
        Re-uploading the same file is safe — duplicate lines are skipped
        via the per-connection external-transaction-id key. PDF statements
        are not supported by this uploader yet; export CSV or OFX from
        the bank instead.
      </p>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="field">
          <span className="field-label">Bank connection</span>
          <select
            name="bankConnectionId"
            className="select"
            required
            defaultValue={connections[0]?.id}
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} · {c.provider} · {c.currency}
              </option>
            ))}
          </select>
          <span className="field-help">
            Imported lines land on this connection.
          </span>
        </label>

        <label className="field">
          <span className="field-label">Format</span>
          <select name="format" className="select" defaultValue="auto">
            <option value="auto">Auto-detect (extension + content)</option>
            <option value="csv">CSV</option>
            <option value="ofx">OFX / QFX</option>
            <option value="mt940">MT940</option>
          </select>
          <span className="field-help">
            .txt files are sniffed for OFX / MT940 markers.
          </span>
        </label>

        <label className="field">
          <span className="field-label">CSV column template</span>
          <select name="csvTemplateId" className="select" defaultValue="auto">
            <option value="auto">Auto-detect columns from header</option>
            {csvTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="field-help">
            CSV only — ignored for OFX / MT940 uploads.
          </span>
        </label>

        <label className="field">
          <span className="field-label">Statement file</span>
          <input
            ref={fileRef}
            type="file"
            name="file"
            className="input"
            accept=".csv,.ofx,.qfx,.txt,.mt940,.sta,.940"
            required
          />
          <span className="field-help">
            Accepted: .csv, .ofx, .qfx, .txt, .mt940, .sta, .940
          </span>
        </label>

        <div className="md:col-span-2">
          <button type="submit" className="btn btn-amber" disabled={pending}>
            {pending ? "Importing…" : "Import statement"}
          </button>
        </div>
      </form>

      {result && <ImportResultPanel result={result} />}
    </Card>
  );
}

function ImportResultPanel({ result }: { result: ImportStatementResult }) {
  if (!result.ok) {
    return (
      <div className="mt-[18px]">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">Import failed</h3>
          <HandoffBadge tone="danger">Failed</HandoffBadge>
        </div>
        <p className="cfo-card-sub mt-[8px] max-w-[680px]">{result.error}</p>
        {result.lineErrors && result.lineErrors.length > 0 && (
          <LineErrorsTable errors={result.lineErrors} truncated={false} />
        )}
      </div>
    );
  }

  return (
    <div className="mt-[18px]">
      <div className="cfo-card-head">
        <h3 className="cfo-card-title">
          Import {result.failed > 0 ? "finished with errors" : "complete"}
        </h3>
        <HandoffBadge tone={result.failed > 0 ? "warn" : "ok"}>
          {result.importCode}
        </HandoffBadge>
      </div>
      <p className="cfo-card-sub mt-[8px] max-w-[680px]">
        {result.totalRows} rows examined ({result.format.toUpperCase()}) ·{" "}
        <strong>{result.imported} imported</strong> · {result.skipped}{" "}
        duplicates skipped · {result.failed} failed
        {result.autoMatched != null &&
          ` · auto-matcher matched ${result.autoMatched} line${result.autoMatched === 1 ? "" : "s"}`}
        {result.autoMatched == null &&
          result.imported > 0 &&
          " · auto-match pass errored — run reconciliation manually"}
        .
      </p>
      {result.imported > 0 && (
        <div className="mt-[12px] flex flex-wrap gap-2">
          <Link
            href="/development-os/finance/accounting"
            className="btn btn-amber btn-sm"
          >
            Open Bank ↔ GL matcher →
          </Link>
          <Link
            href="/development-os/finance/reconciliation"
            className="btn btn-secondary btn-sm"
          >
            Reconciliation dashboard
          </Link>
          <Link
            href="/development-os/finance/bank-review"
            className="btn btn-secondary btn-sm"
          >
            Bank review inbox
          </Link>
        </div>
      )}
      {result.lineErrors.length > 0 && (
        <LineErrorsTable
          errors={result.lineErrors}
          truncated={result.lineErrorsTruncated}
        />
      )}
    </div>
  );
}

function LineErrorsTable({
  errors,
  truncated,
}: {
  errors: Array<{ rowIndex: number; reason: string }>;
  truncated: boolean;
}) {
  return (
    <div className="mt-[12px]">
      <table className="data">
        <thead>
          <tr>
            <th className="num">Row</th>
            <th>Why it failed</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e, i) => (
            <tr key={`${e.rowIndex}-${i}`}>
              <td className="num mono">{e.rowIndex}</td>
              <td>{e.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="cfo-card-sub mt-[8px]">
          Showing the first {errors.length} errors — the full list is in
          the import&apos;s error log.
        </p>
      )}
    </div>
  );
}
