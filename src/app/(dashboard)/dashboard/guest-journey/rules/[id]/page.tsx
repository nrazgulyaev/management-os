import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest journey", href: "/dashboard/guest-journey" },
          { label: "Rules", href: "/dashboard/guest-journey/rules" },
          { label: rule.name },
        ]}
        title={rule.name}
        description={rule.description ?? undefined}
        actions={
          <div className="flex items-center gap-3">
            {rule.status === "active" ? (
              <PauseRuleButton id={rule.id} />
            ) : rule.status === "paused" ? (
              <ResumeRuleButton id={rule.id} />
            ) : null}
            {rule.status !== "archived" && <ArchiveRuleButton id={rule.id} />}
          </div>
        }
      />
      <Section eyebrow="Configuration" title="Trigger + dispatch">
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
      </Section>
    </div>
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
    <div className="rounded-2xl border border-line-soft bg-surface shadow-soft-card p-4">
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </dt>
      <dd
        className={`mt-1 text-ink ${mono ? "font-mono text-xs" : "text-sm"}`}
      >
        {valueNode ?? value ?? "—"}
      </dd>
    </div>
  );
}
