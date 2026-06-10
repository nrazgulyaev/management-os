import Link from "next/link";
import { CreateRuleSetForm } from "@/components/dynamic-pricing/create-rule-set-form";

export const metadata = { title: "New rule set" };
export const dynamic = "force-dynamic";

export default function NewRuleSetPage() {
  return (
    <>
      <div className="page-header !mb-0 !pb-[18px]">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/pricing">Dynamic pricing</Link> /{" "}
            <Link href="/dashboard/pricing/rule-sets">Rule sets</Link> / <span>New</span>
          </div>
          <h1>New rule set</h1>
          <p className="text-[13.5px] text-ink-3 mt-2 max-w-[720px]">
            Pick a scope (global / project / villa) and a base rate. Add modifier rules from the
            detail page after creation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start mt-[18px]">
        <div className="card card-pad">
          <div className="label text-[9.5px] mb-3.5">Configure · rule set</div>
          <CreateRuleSetForm />
        </div>
      </div>
    </>
  );
}
