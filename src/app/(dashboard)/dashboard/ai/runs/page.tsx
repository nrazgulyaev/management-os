import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { listAssistantRuns } from "@/features/ai/operations-copilot/service";

export const metadata = { title: "AI runs" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "soft" | "info" | "warn" | "ok" | "danger"
> = {
  succeeded: "ok",
  fallback: "soft",
  failed: "danger",
  running: "info",
};

export default async function AIRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent } = await searchParams;
  const assistantKey = agent && agent.trim().length > 0 ? agent.trim() : undefined;
  const runs = await listAssistantRuns({ limit: 50, assistantKey });

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/ai">AI assistants</Link> /{" "}
            <span>Runs</span>
          </div>
          <h1>
            {assistantKey
              ? `Runs · ${assistantKey.replace(/_/g, " ")}`
              : "AI assistant runs"}
          </h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Every Co-pilot invocation is logged with status, model, latency,
            token usage, and the tool calls it issued. Useful for diagnosing
            fallback drops and reviewing prompt cost.
          </p>
        </div>
      </div>

      {assistantKey && (
        <p className="-mt-6 text-sm text-ink-tertiary">
          Filtered to <span className="font-medium text-ink">{assistantKey}</span>.{" "}
          <Link href="/dashboard/ai/runs" className="underline underline-offset-4">
            Show all runs
          </Link>
        </p>
      )}

      <div>
        <div className="label mb-2.5">Runs</div>
        {runs.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No runs yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Assistant</th>
                  <th scope="col">Status</th>
                  <th scope="col">Model</th>
                  <th scope="col" className="num">Latency</th>
                  <th scope="col" className="num">Tokens</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular-nums">
                      {r.createdAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="row-title">{r.assistantKey}</td>
                    <td>
                      <HandoffBadge tone={STATUS_TONES[r.status] ?? "soft"}>
                        {r.status}
                      </HandoffBadge>
                    </td>
                    <td className="text-ink-tertiary text-xs">
                      {r.model ?? "—"}
                    </td>
                    <td className="num tabular-nums">
                      {r.latencyMs ? `${r.latencyMs} ms` : "—"}
                    </td>
                    <td className="num tabular-nums">
                      {r.totalTokens ?? "—"}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/dashboard/ai/runs/${r.id}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Detail →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
