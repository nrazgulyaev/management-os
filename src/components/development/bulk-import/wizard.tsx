"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls } from "@/components/admin/form-shell";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { parseCsv } from "@/lib/development/server/bulk-import/csv-parser-helpers";
import { parseXlsx } from "@/lib/development/server/bulk-import/xlsx-parser-helpers";
import {
  applyMapping,
  autoSuggestMapping,
  INTERNAL_FIELDS_PER_ENTITY,
  type FieldMapping,
} from "@/lib/development/server/bulk-import/field-mapper-helpers";
import { validateRow } from "@/lib/development/server/bulk-import/validator-helpers";
import {
  createBulkImportJob,
  validateBulkImportJob,
  processBulkImportJob,
} from "@/lib/development/server/bulk-import/import-actions";
import {
  BULK_IMPORT_ENTITY_TYPES,
  type BulkImportEntityType,
  type BulkImportSourceType,
} from "@/lib/db/schema/bulk-import";

/**
 * Stage 6.P0.7-C — Bulk Import Wizard.
 *
 * Single-page implementation that walks through the 6 launch-prompt
 * steps as collapsible sections (Upload → Entity → Mapping → Preview →
 * Confirm → Results). Single-page reduces step-component sprawl AND
 * keeps the bookkeeper's mental context (they can scroll back to fix
 * the mapping after seeing the preview without losing state).
 *
 * Step navigation: a top progress strip + per-step "Next" buttons.
 * Going back is always available; data preserved in component state.
 *
 * File parsing happens client-side using the pure helpers from P0.7-A.
 * The server action receives the parsed source content as text/base64.
 */

const FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB
const PREVIEW_ROW_CAP = 10;
const STATUS_POLL_MS = 2000;

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface UploadedFile {
  filename: string;
  sizeBytes: number;
  /** CSV/JSON text or XLSX base64. Stored in source_content on the job row. */
  content: string;
  sourceType: BulkImportSourceType;
}

interface ParsedTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

const STEP_LABELS: Record<Step, string> = {
  1: "Upload",
  2: "Entity type",
  3: "Field mapping",
  4: "Preview",
  5: "Confirm",
  6: "Results",
};

export function BulkImportWizard() {
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Step 1
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [parsed, setParsed] = useState<ParsedTable | null>(null);

  // Step 2
  const [entityType, setEntityType] = useState<BulkImportEntityType | "">("");

  // Step 3
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [saveMappingAs, setSaveMappingAs] = useState<string>("");

  // Step 4 (computed from parsed + mapping)
  const previewRows = parsed?.rows.slice(0, PREVIEW_ROW_CAP) ?? [];
  const previewValidation = entityType
    ? previewRows.map((r, i) => {
        const mapped = applyMapping(r, mapping);
        const v = validateRow(entityType, mapped);
        return { rowIndex: i, raw: r, valid: v.ok, errors: v.errors ?? [] };
      })
    : [];
  const previewValidCount = previewValidation.filter((p) => p.valid).length;
  const previewInvalidCount = previewValidation.length - previewValidCount;

  // Step 5+6
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);
  const [createdJobCode, setCreatedJobCode] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<{
    status?: string;
    processed?: number;
    successful?: number;
    failed?: number;
    total?: number;
  } | null>(null);

  // ----- Step 1 handlers
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > FILE_SIZE_LIMIT_BYTES) {
      setError(`File too large (max ${FILE_SIZE_LIMIT_BYTES / 1024 / 1024} MB)`);
      return;
    }
    const ext = f.name.toLowerCase().split(".").pop() ?? "";
    let sourceType: BulkImportSourceType;
    let content: string;
    let parsed: ParsedTable;

    try {
      if (ext === "csv") {
        sourceType = "csv";
        content = await f.text();
        const r = parseCsv(content);
        parsed = { headers: r.headers, rows: r.rows };
      } else if (ext === "xlsx" || ext === "xls") {
        sourceType = "xlsx";
        const buf = await f.arrayBuffer();
        // base64 encode for transport
        const bytes = new Uint8Array(buf);
        const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
        content = btoa(binary);
        const r = parseXlsx(bytes);
        parsed = { headers: r.headers, rows: r.rows };
      } else if (ext === "json") {
        sourceType = "json";
        content = await f.text();
        const data = JSON.parse(content);
        const arr: unknown[] = Array.isArray(data) ? data : [data];
        const headerSet = new Set<string>();
        for (const r of arr) {
          if (r && typeof r === "object") {
            for (const k of Object.keys(r)) headerSet.add(k);
          }
        }
        const headers = [...headerSet];
        const rows = arr.map((r) => {
          const row: Record<string, string> = {};
          if (r && typeof r === "object") {
            for (const h of headers) {
              const v = (r as Record<string, unknown>)[h];
              row[h] = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
            }
          }
          return row;
        });
        parsed = { headers, rows };
      } else {
        setError(`Unsupported file type: .${ext}. Use CSV, XLSX, or JSON.`);
        return;
      }

      if (parsed.rows.length === 0) {
        setError("File parsed but has no data rows");
        return;
      }

      setFile({ filename: f.name, sizeBytes: f.size, content, sourceType });
      setParsed(parsed);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? `Parse error: ${e.message}` : "Parse error");
    }
  }

  // ----- Step 2 handler — auto-suggest mapping when entity selected
  function handleEntityChange(et: BulkImportEntityType) {
    setEntityType(et);
    if (parsed) {
      const internal = INTERNAL_FIELDS_PER_ENTITY[et] ?? [];
      const suggested = autoSuggestMapping(parsed.headers, internal);
      setMapping(suggested);
    }
  }

  // ----- Step 3 — mapping changes
  function setMappingFor(externalCol: string, internalField: string) {
    setMapping((prev) => {
      const next = { ...prev };
      if (!internalField) {
        delete next[externalCol];
      } else {
        next[externalCol] = { internalField, transform: prev[externalCol]?.transform };
      }
      return next;
    });
  }

  // ----- Step 5 — submit job
  function handleSubmit() {
    if (!file || !entityType || !parsed) {
      setError("Missing data");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createBulkImportJob({
          entityType,
          sourceType: file.sourceType,
          sourceFilename: file.filename,
          sourceSizeBytes: file.sizeBytes,
          sourceContent: file.content,
          fieldMapping: mapping,
          saveMappingAs: saveMappingAs || undefined,
        });
        if (!result.ok || !result.jobId) {
          setError(result.error ?? "Failed to create job");
          return;
        }
        setCreatedJobId(result.jobId);
        setCreatedJobCode(result.jobCode ?? null);
        // Run validate + first batch synchronously so the user gets
        // immediate feedback rather than waiting for cron.
        await validateBulkImportJob({ jobId: result.jobId });
        await processBulkImportJob({ jobId: result.jobId });
        setStep(6);
        // Begin polling for completion.
        beginPolling(result.jobId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submit failed");
      }
    });
  }

  function beginPolling(jobId: string) {
    let active = true;
    const tick = async () => {
      if (!active) return;
      try {
        const job = await import(
          "@/lib/development/server/bulk-import/import-actions"
        ).then((m) => m.getBulkImportJob({ jobId }));
        if (job) {
          setJobStatus({
            status: job.status,
            processed: job.processedRows,
            successful: job.successfulRows,
            failed: job.failedRows,
            total: job.totalRows ?? undefined,
          });
          if (
            job.status === "completed" ||
            job.status === "failed" ||
            job.status === "cancelled"
          ) {
            active = false;
            return;
          }
          // Run another batch (for jobs that span multiple batches).
          await processBulkImportJob({ jobId });
        }
      } catch {
        /* swallow — UI shows last known status */
      }
      setTimeout(tick, STATUS_POLL_MS);
    };
    tick();
  }

  function reset() {
    setStep(1);
    setFile(null);
    setParsed(null);
    setEntityType("");
    setMapping({});
    setSaveMappingAs("");
    setCreatedJobId(null);
    setCreatedJobCode(null);
    setJobStatus(null);
    setError(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <ProgressStrip current={step} />

      {error && (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink"
        >
          {error}
        </div>
      )}

      {/* ----- Step 1: Upload */}
      <Section
        eyebrow="Step 1"
        title={STEP_LABELS[1]}
        description="Upload a CSV, XLSX, or JSON file (max 10 MB)."
      >
        {!file ? (
          <label
            className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-line-soft rounded-md p-10 cursor-pointer hover:border-line-strong transition-colors"
            data-testid="bulk-import-upload-zone"
          >
            <Upload className="w-8 h-8 text-ink-tertiary" strokeWidth={1.5} />
            <span className="text-sm text-ink-secondary">
              Drag a file here or click to browse
            </span>
            <span className="text-xs text-ink-tertiary">CSV / XLSX / JSON</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-md border border-line-soft bg-surface p-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-ink-secondary" strokeWidth={1.75} />
              <div>
                <div className="text-sm text-ink font-medium">{file.filename}</div>
                <div className="text-xs text-ink-tertiary">
                  {(file.sizeBytes / 1024).toFixed(1)} KB · {parsed?.rows.length ?? 0} rows · {parsed?.headers.length ?? 0} columns
                </div>
              </div>
            </div>
            <Button variant="ghost" onClick={() => { setFile(null); setParsed(null); setStep(1); }}>
              Change file
            </Button>
          </div>
        )}
      </Section>

      {/* ----- Step 2: Entity */}
      {file && (
        <Section
          eyebrow="Step 2"
          title={STEP_LABELS[2]}
          description="What kind of records are in this file?"
        >
          <Field label="Entity type" required>
            <select
              value={entityType}
              onChange={(e) => handleEntityChange(e.target.value as BulkImportEntityType)}
              className={selectCls}
              data-testid="bulk-import-entity-select"
            >
              <option value="" disabled>Select entity…</option>
              {BULK_IMPORT_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </Field>
        </Section>
      )}

      {/* ----- Step 3: Field mapping */}
      {file && entityType && (
        <Section
          eyebrow="Step 3"
          title={STEP_LABELS[3]}
          description="Match each source column to an internal field. Auto-suggested where header names match."
        >
          <div className="rounded-md border border-line-soft overflow-hidden">
            <table className="w-full text-sm" data-testid="bulk-import-mapping-table">
              <thead className="bg-muted/40">
                <tr className="text-left text-ink-tertiary">
                  <th className="py-2 px-3">Source column</th>
                  <th className="py-2 px-3">Sample</th>
                  <th className="py-2 px-3">→ Internal field</th>
                </tr>
              </thead>
              <tbody>
                {parsed?.headers.map((h) => (
                  <tr key={h} className="border-t border-line-soft">
                    <td className="py-2 px-3 font-mono text-xs">{h}</td>
                    <td className="py-2 px-3 text-xs text-ink-tertiary">
                      {parsed.rows[0]?.[h]?.slice(0, 40) ?? "—"}
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={mapping[h]?.internalField ?? ""}
                        onChange={(e) => setMappingFor(h, e.target.value)}
                        className={`${selectCls} text-xs`}
                      >
                        <option value="">— skip —</option>
                        {(INTERNAL_FIELDS_PER_ENTITY[entityType] ?? []).map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Field label="Save mapping as (optional)" hint="Reuse this mapping for future imports of the same entity type">
            <input
              type="text"
              value={saveMappingAs}
              onChange={(e) => setSaveMappingAs(e.target.value)}
              maxLength={120}
              placeholder="My QuickBooks vendor mapping"
              className={inputCls}
            />
          </Field>

          <div className="flex justify-end gap-3">
            <Button onClick={() => setStep(4)} disabled={Object.keys(mapping).length === 0}>
              Preview <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </div>
        </Section>
      )}

      {/* ----- Step 4: Preview */}
      {file && entityType && step >= 4 && step < 6 && (
        <Section
          eyebrow="Step 4"
          title={STEP_LABELS[4]}
          description={`First ${previewRows.length} rows shown. Validate before commit.`}
        >
          <div className="flex items-center gap-3 mb-3 text-sm">
            <Badge tone="success" data-testid="preview-valid-count">
              {previewValidCount} valid
            </Badge>
            {previewInvalidCount > 0 && (
              <Badge tone="danger" data-testid="preview-invalid-count">
                {previewInvalidCount} invalid
              </Badge>
            )}
          </div>
          <div className="rounded-md border border-line-soft overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-ink-tertiary">
                <tr>
                  <th className="py-2 px-3 text-left">#</th>
                  <th className="py-2 px-3 text-left">Status</th>
                  <th className="py-2 px-3 text-left">Errors</th>
                  <th className="py-2 px-3 text-left">Source row</th>
                </tr>
              </thead>
              <tbody>
                {previewValidation.map((p) => (
                  <tr key={p.rowIndex} className="border-t border-line-soft">
                    <td className="py-2 px-3 font-mono">{p.rowIndex + 1}</td>
                    <td className="py-2 px-3">
                      {p.valid ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="w-3 h-3" /> ok
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-danger">
                          <AlertCircle className="w-3 h-3" /> error
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-ink-tertiary">
                      {p.errors
                        .map((e) => `${e.field}: ${e.message}`)
                        .join("; ") || "—"}
                    </td>
                    <td className="py-2 px-3 text-ink-tertiary truncate max-w-[400px]">
                      {Object.values(p.raw).join(" · ").slice(0, 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between gap-3 mt-4">
            <Button variant="ghost" onClick={() => setStep(3)}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to mapping
            </Button>
            <Button onClick={() => setStep(5)}>
              Continue <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </div>
        </Section>
      )}

      {/* ----- Step 5: Confirm */}
      {step === 5 && (
        <Section
          eyebrow="Step 5"
          title={STEP_LABELS[5]}
          description="Final review before kicking off the import."
        >
          <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
            <dt className="text-ink-tertiary">File</dt>
            <dd className="text-ink">{file?.filename}</dd>
            <dt className="text-ink-tertiary">Entity</dt>
            <dd className="text-ink">{entityType}</dd>
            <dt className="text-ink-tertiary">Total rows</dt>
            <dd className="text-ink font-mono">{parsed?.rows.length ?? 0}</dd>
            <dt className="text-ink-tertiary">Mapped fields</dt>
            <dd className="text-ink font-mono">{Object.keys(mapping).length}</dd>
          </dl>
          <div className="flex justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(4)}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back
            </Button>
            <Button onClick={handleSubmit} disabled={pending} data-testid="bulk-import-submit">
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> Starting…
                </>
              ) : (
                "Start import"
              )}
            </Button>
          </div>
        </Section>
      )}

      {/* ----- Step 6: Results */}
      {step === 6 && createdJobId && (
        <Section
          eyebrow="Step 6"
          title={STEP_LABELS[6]}
          description={`Job ${createdJobCode ?? createdJobId.slice(0, 8)} — live status`}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Status" value={jobStatus?.status ?? "pending"} />
            <Stat label="Total" value={jobStatus?.total ?? "—"} />
            <Stat label="Successful" value={jobStatus?.successful ?? 0} />
            <Stat label="Failed" value={jobStatus?.failed ?? 0} />
          </div>
          {jobStatus?.total ? (
            <div className="rounded-full overflow-hidden h-2 bg-muted">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: `${Math.round(((jobStatus.processed ?? 0) / (jobStatus.total ?? 1)) * 100)}%`,
                }}
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={reset}>
              Import another file
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}

function ProgressStrip({ current }: { current: Step }) {
  const steps: Step[] = [1, 2, 3, 4, 5, 6];
  return (
    <ol className="flex items-center gap-1 text-xs" data-testid="bulk-import-progress">
      {steps.map((s, i) => {
        const isActive = s === current;
        const isPast = s < current;
        return (
          <li key={s} className="flex items-center gap-1">
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-medium ${
                isPast
                  ? "bg-success text-white"
                  : isActive
                    ? "bg-ink text-white"
                    : "bg-muted text-ink-tertiary"
              }`}
            >
              {isPast ? "✓" : s}
            </span>
            <span className={isActive ? "text-ink font-medium" : "text-ink-tertiary"}>
              {STEP_LABELS[s]}
            </span>
            {i < steps.length - 1 && <span className="text-ink-tertiary mx-1">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-3">
      <div className="text-xs text-ink-tertiary uppercase tracking-wide">{label}</div>
      <div className="text-base font-medium text-ink mt-1 font-mono tabular-nums">{value}</div>
    </div>
  );
}
