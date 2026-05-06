import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { CreateRuleSetForm } from "@/components/dynamic-pricing/create-rule-set-form";

export const metadata = { title: "New rule set" };
export const dynamic = "force-dynamic";

export default function NewRuleSetPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Dynamic pricing", href: "/dashboard/pricing" },
          { label: "Rule sets", href: "/dashboard/pricing/rule-sets" },
          { label: "New" },
        ]}
        title="New rule set"
        description="Pick a scope (global / project / villa) and a base rate. Add modifier rules from the detail page after creation."
      />
      <Section eyebrow="Configure" title="Rule set">
        <CreateRuleSetForm />
      </Section>
    </div>
  );
}
