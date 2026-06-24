/**
 * P1 (superadmin-plans-console) — Plans & pricing editor.
 *
 * Grid of subscription plans (price + limits + live org counts) with a
 * "+ New plan" / edit form. Reads from the existing subscription_plans +
 * plan_features + feature_flags tables; mutations live in
 * `@/lib/subscription-os/plan-actions` (super-admin gated + audit-logged).
 *
 * No real PSP — pricing here is the plan CATALOG (Indonesia rails
 * deferred; manual mark-paid only). Gated to super_admin by the
 * (platform-app) layout.
 */

import type { Metadata } from "next";
import { SectionHeading } from "@/components/dashboard/primitives";
import {
  listPlansWithCounts,
  type PlanWithCounts,
} from "@/lib/subscription-os/queries";
import { safeQuery } from "@/lib/development/safe-query";
import { PlansEditor } from "@/components/subscription-os/plans-editor";

export const metadata: Metadata = { title: "Plans & pricing · Platform Admin OS" };
export const dynamic = "force-dynamic";

export default async function PlansEditorPage() {
  const plans = await safeQuery(
    "platform-console.plans",
    listPlansWithCounts(),
    [] as PlanWithCounts[],
    4000,
  );

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-8">
      <div className="flex flex-col gap-[22px]">
        <div className="crumb">Platform Admin OS · Plans &amp; pricing</div>
        <SectionHeading
          eyebrow={`${plans.length} plan${plans.length === 1 ? "" : "s"}`}
          title="Plans & pricing"
          subtitle="The plan catalog that gates customers by tier. Set price (minor units), trial length, limits, and visibility. No charge is made here — pricing flows to subscriptions via org_subscriptions."
        />
      </div>

      <PlansEditor plans={plans} />
    </div>
  );
}
