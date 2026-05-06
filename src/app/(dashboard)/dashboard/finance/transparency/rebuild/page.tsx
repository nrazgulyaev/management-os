import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import {
  RebuildAllTransparencyButton,
  RebuildOwnerTransparencyForm,
} from "@/components/finance/transparency-buttons";

export const metadata = { title: "Statement transparency · rebuild" };
export const dynamic = "force-dynamic";

export default function ManualRebuildPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Transparency", href: "/dashboard/finance/transparency" },
          { label: "Rebuild" },
        ]}
        title="Manual rebuild"
        description="Use these forms to rebuild the transparency layer for a single owner or every recent statement. The cron job runs at 05:00 UTC daily."
      />
      <Section
        eyebrow="All statements"
        title="Rebuild every recent statement"
        description="Default window: period_end within 120 days, statement status draft / issued / approved."
      >
        <RebuildAllTransparencyButton />
      </Section>
      <Section
        eyebrow="Per owner"
        title="Rebuild every statement for one owner"
      >
        <RebuildOwnerTransparencyForm />
      </Section>
      <Section
        eyebrow="Per statement"
        title="Rebuild a single statement"
        description="Use the Rebuild button on the statement detail page or in the statements table to target a single statement."
      >
        <p className="text-xs text-ink-tertiary">
          The transparency layer is a derived view — wipe + reinsert is
          idempotent and does not affect accounting rows.
        </p>
      </Section>
    </div>
  );
}
