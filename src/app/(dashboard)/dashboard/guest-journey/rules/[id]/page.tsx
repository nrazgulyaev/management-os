import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getGuestJourneyRule } from "@/features/guest-journey/services";
import {
  ArchiveRuleButton,
  PauseRuleButton,
  ResumeRuleButton,
} from "@/components/guest-journey/journey-buttons";

export const metadata = { title: "Journey rule" };
export const dynamic = "force-dynamic";

export default async function JourneyRuleDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rule = await getGuestJourneyRule(id);
  if (!rule) notFound();
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-journey">Guest journey</Link> /{" "}
            <Link href="/dashboard/guest-journey/rules">Rules</Link> /{" "}
            <span>{rule.name}</span>
          </div>
          <h1>{rule.name}</h1>
          {rule.description && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
              {rule.description}
            </p>
          )}
        </div>
        <div className="actions">
          {rule.status === "active" ? (
            <PauseRuleButton id={rule.id} />
          ) : rule.status === "paused" ? (
            <ResumeRuleButton id={rule.id} />
          ) : null}
          {rule.status !== "archived" && <ArchiveRuleButton id={rule.id} />}
        </div>
      </div>

      <h2 className="display text-[22px] font-normal mb-3.5">
        Trigger + dispatch
      </h2>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <Field label="Rule key" value={rule.ruleKey} mono />
        <Field label="Stage" value={rule.journeyStage.replace("_", " ")} />
        <Field label="Anchor" value={rule.triggerAnchor.replace("_", " ")} />
        <Field
          label="Offset"
          value={`${rule.offsetMinutes >= 0 ? "+" : ""}${rule.offsetMinutes}m`}
          mono
        />
        <Field label="Channel" value={rule.channel} />
        <Field label="Priority" value={rule.priority} />
        <Field label="Suggestion" value={rule.suggestionType ?? "—"} />
        <Field label="Template key" value={rule.templateKey ?? "—"} mono />
        <Field
          label="Channel filter"
          value={rule.appliesToChannel ?? "any"}
        />
        <Field
          label="Status"
          valueNode={
            <Badge
              tone={
                rule.status === "active"
                  ? "success"
                  : rule.status === "paused"
                    ? "warning"
                    : "neutral"
              }
            >
              {rule.status}
            </Badge>
          }
        />
      </dl>
    </>
  );
}

function Field({
  label,
  value,
  valueNode,
  mono,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="card px-4 py-3.5">
      <dt className="mono text-[10px] uppercase tracking-[0.16em] text-ink-4">
        {label}
      </dt>
      <dd className={`mt-1 ${mono ? "mono text-xs" : "text-sm"}`}>
        {valueNode ?? value ?? "—"}
      </dd>
    </div>
  );
}
