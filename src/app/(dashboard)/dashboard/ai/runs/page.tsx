import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listAssistantRuns } from "@/features/ai/operations-copilot/service";

export const metadata = { title: "AI runs" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  succeeded: "success",
  fallback: "neutral",
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
      <PageHeader
        breadcrumbs={[
          { label: "AI assistants", href: "/dashboard/ai" },
          { label: "Runs" },
        ]}
        title={assistantKey ? `Runs · ${assistantKey.replace(/_/g, " ")}` : "AI assistant runs"}
        description="Every Co-pilot invocation is logged with status, model, latency, token usage, and the tool calls it issued. Useful for diagnosing fallback drops and reviewing prompt cost."
      />

      {assistantKey && (
        <p className="-mt-6 text-sm text-ink-tertiary">
          Filtered to <span className="font-medium text-ink">{assistantKey}</span>.{" "}
          <Link href="/dashboard/ai/runs" className="underline underline-offset-4">
            Show all runs
          </Link>
        </p>
      )}

      <Section eyebrow="Runs" title="Most recent">
        {runs.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No runs yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Assistant</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Model</th>
                  <th className="text-right px-3 py-2">Latency</th>
                  <th className="text-right px-3 py-2">Tokens</th>
                  <th className="text-left px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink-secondary tabular-nums">
                      {r.createdAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {r.assistantKey}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {r.model ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-tertiary tabular-nums">
                      {r.latencyMs ? `${r.latencyMs} ms` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-tertiary tabular-nums">
                      {r.totalTokens ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
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
      </Section>
    </div>
  );
}
