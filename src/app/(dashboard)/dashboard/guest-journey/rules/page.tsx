import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { listGuestJourneyRules } from "@/features/guest-journey/services";
import { GuestJourneyRuleAddButton } from "@/components/guest-journey/rule-add-button";

export const metadata = { title: "Journey rules" };
export const dynamic = "force-dynamic";

export default async function JourneyRulesList() {
  const rules = await listGuestJourneyRules();
  const activeCount = rules.filter((r) => r.status === "active").length;
  const pausedCount = rules.filter((r) => r.status === "paused").length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-journey">Guest journey</Link> /{" "}
            <span>Rules</span>
          </div>
          <h1>Journey rules</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Each rule maps a (stage, anchor, offset, channel) tuple to either a
            guest suggestion, a queued notification, or both.
          </p>
        </div>
        <div className="actions">
          <GuestJourneyRuleAddButton />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-[18px]">
        <Kpi label="Rules configured" value={String(rules.length)} />
        <Kpi
          label="Active"
          value={String(activeCount)}
          tone={activeCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Paused"
          value={String(pausedCount)}
          tone={pausedCount > 0 ? "warn" : undefined}
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">Stage</th>
              <th scope="col">Anchor</th>
              <th scope="col" className="num">Offset</th>
              <th scope="col">Suggestion</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <TableEmpty colSpan={6}>
                No rules yet — seed the demo set or create one.
              </TableEmpty>
            ) : (
              rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      href={`/dashboard/guest-journey/rules/${r.id}`}
                      className="hover:text-terra"
                    >
                      {r.name}
                    </Link>
                    <div className="mono text-[10px] text-ink-4">
                      {r.ruleKey}
                    </div>
                  </td>
                  <td className="text-[12px] text-ink-3 capitalize">
                    {r.journeyStage.replace("_", " ")}
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {r.triggerAnchor.replace("_", " ")}
                  </td>
                  <td className="num mono text-[12px]">
                    {r.offsetMinutes >= 0 ? "+" : ""}
                    {r.offsetMinutes}m
                  </td>
                  <td className="text-[12px] text-ink-3">
                    {r.suggestionType ?? "—"}
                  </td>
                  <td>
                    <Badge
                      tone={
                        r.status === "active"
                          ? "success"
                          : r.status === "paused"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
