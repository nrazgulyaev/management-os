import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listOpenSuggestions } from "@/features/maintenance-intelligence/services";

export const metadata = { title: "Maintenance windows" };
export const dynamic = "force-dynamic";

export default async function WindowsPage() {
  const rows = await listOpenSuggestions(200);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/maintenance-intelligence">Maintenance intelligence</Link> /{" "}
            <span>Window suggestions</span>
          </div>
          <h1>Window suggestions</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Top scored windows across every plan. Accept on the plan detail page to materialise an operation_task and (when needed) a maintenance_block.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Open · {rows.length} suggestions</div>
        {rows.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            None. Open a plan and click "Refresh suggestions".
          </p>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Villa</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Category</th>
                  <th scope="col">Window</th>
                  <th scope="col" className="num">Score</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="row-title">{r.villaCode ?? "—"}</td>
                    <td>{r.planName ?? "—"}</td>
                    <td className="text-ink-3 text-[12px]">{r.category ?? "—"}</td>
                    <td className="tabular-nums text-ink-3">
                      {r.suggestedStart.slice(0, 16).replace("T", " ")} →{" "}
                      {r.suggestedEnd.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="num">
                      <HandoffBadge tone={r.score >= 0.8 ? "ok" : r.score >= 0.6 ? "info" : "warn"}>
                        {r.score.toFixed(2)}
                      </HandoffBadge>
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/dashboard/maintenance-intelligence/plans/${r.planId}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Plan →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
