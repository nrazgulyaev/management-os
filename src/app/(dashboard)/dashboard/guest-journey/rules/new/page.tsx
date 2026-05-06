import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { CreateGuestJourneyRuleForm } from "@/components/guest-journey/create-rule-form";

export const metadata = { title: "New journey rule" };
export const dynamic = "force-dynamic";

export default function NewJourneyRulePage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest journey", href: "/dashboard/guest-journey" },
          { label: "Rules", href: "/dashboard/guest-journey/rules" },
          { label: "New" },
        ]}
        title="New journey rule"
        description="Choose stage + anchor + offset. The runner will materialise one (booking, rule) row per active booking and dispatch when scheduled_for arrives."
      />
      <Section eyebrow="Configure" title="Rule definition">
        <CreateGuestJourneyRuleForm />
      </Section>
    </div>
  );
}
