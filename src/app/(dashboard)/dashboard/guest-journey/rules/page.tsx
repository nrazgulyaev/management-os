import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listGuestJourneyRules } from "@/features/guest-journey/services";
import { GuestJourneyRuleAddButton } from "@/components/guest-journey/rule-add-button";

export const metadata = { title: "Journey rules" };
export const dynamic = "force-dynamic";

export default async function JourneyRulesList() {
  const rules = await listGuestJourneyRules();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest journey", href: "/dashboard/guest-journey" },
          { label: "Rules" },
        ]}
        title="Journey rules"
        description="Each rule maps a (stage, anchor, offset, channel) tuple to either a guest suggestion, a queued notification, or both."
        actions={<GuestJourneyRuleAddButton />}
      />
      <Section eyebrow="Rules" title={`${rules.length} configured`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Rule</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Anchor</th>
                <th className="px-4 py-3">Offset</th>
                <th className="px-4 py-3">Suggestion</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No rules yet — seed the demo set or create one.
                  </td>
                </tr>
              )}
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-line-soft">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/guest-journey/rules/${r.id}`}
                      className="text-ink hover:underline underline-offset-4"
                    >
                      {r.name}
                    </Link>
                    <div className="text-[10px] font-mono text-ink-tertiary">
                      {r.ruleKey}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">
                    {r.journeyStage.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.triggerAnchor.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">
                    {r.offsetMinutes >= 0 ? "+" : ""}
                    {r.offsetMinutes}m
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.suggestionType ?? "—"}
                  </td>
                  <td className="px-4 py-3">
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
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
