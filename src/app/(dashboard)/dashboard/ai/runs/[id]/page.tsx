import Link from "next/link";
import { notFound } from "next/navigation";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { getAssistantRunDetail } from "@/features/ai/operations-copilot/service";

export const metadata = { title: "AI run detail" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "soft" | "info" | "warn" | "ok" | "danger"
> = {
  succeeded: "ok",
  fallback: "soft",
  failed: "danger",
  running: "info",
  blocked: "danger",
  success: "ok",
};

export default async function AIRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { run, toolCalls } = await getAssistantRunDetail(id);
  if (!run) notFound();

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/ai">AI assistants</Link> /{" "}
            <Link href="/dashboard/ai/runs">Runs</Link> /{" "}
            <span>{run.id.slice(0, 8)}</span>
          </div>
          <h1>{`Run ${run.id.slice(0, 8)}`}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`Assistant: ${run.assistantKey} · Trigger: ${run.runType}`}
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Run</div>
        <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Status">
            <HandoffBadge tone={STATUS_TONES[run.status] ?? "soft"}>
              {run.status}
            </HandoffBadge>
          </Field>
          <Field label="Model" value={run.model ?? "—"} />
          <Field
            label="Latency"
            value={run.latencyMs != null ? `${run.latencyMs} ms` : "—"}
          />
          <Field
            label="Tokens"
            value={
              run.totalTokens != null
                ? `${run.totalTokens} (${run.promptTokens ?? 0}p + ${run.completionTokens ?? 0}c)`
                : "—"
            }
          />
          <Field
            label="Started"
            value={run.createdAt.slice(0, 19).replace("T", " ")}
          />
          <Field
            label="Finished"
            value={run.finishedAt?.slice(0, 19).replace("T", " ") ?? "—"}
          />
          {run.errorMessage && (
            <div className="md:col-span-4">
              <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                Error
              </div>
              <p className="text-sm text-danger mt-1">{run.errorMessage}</p>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Prompt</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CodeBlock label="Input summary" body={run.inputSummary ?? "—"} />
          <CodeBlock label="Output summary" body={run.outputSummary ?? "—"} />
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Tool calls</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          {`${toolCalls.length} dispatch${toolCalls.length === 1 ? "" : "es"}`} —
          read-only allowlist. Calls outside the allowlist are recorded with
          status=&apos;blocked&apos; and never reach the database.
        </p>
        {toolCalls.length === 0 ? (
          <p className="text-sm text-ink-tertiary">
            No tool calls. The model produced its answer without retrieval.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {toolCalls.map((c) => (
                <li key={c.id} className="p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <HandoffBadge tone={STATUS_TONES[c.status] ?? "soft"}>
                      {c.status}
                    </HandoffBadge>
                    <span className="text-sm text-ink font-medium">
                      {c.toolName}
                    </span>
                    <span className="text-[11px] text-ink-tertiary tabular-nums">
                      {c.createdAt.slice(11, 19)}
                    </span>
                  </div>
                  {c.errorMessage && (
                    <p className="text-xs text-danger mt-1.5">
                      {c.errorMessage}
                    </p>
                  )}
                  {c.inputJson != null && (
                    <pre className="mt-2 text-[11px] bg-muted/30 rounded-sm p-2 overflow-x-auto text-ink-secondary">
                      {JSON.stringify(c.inputJson, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="mt-1">{children ?? <span>{value}</span>}</div>
    </div>
  );
}

function CodeBlock({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-ink-tertiary mb-1.5">
        {label}
      </div>
      <pre className="text-xs bg-muted/30 rounded-sm p-3 overflow-x-auto whitespace-pre-wrap break-words text-ink-secondary">
        {body}
      </pre>
    </div>
  );
}
