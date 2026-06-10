import Link from "next/link";
import { CreateGuestJourneyRuleForm } from "@/components/guest-journey/create-rule-form";

export const metadata = { title: "New journey rule" };
export const dynamic = "force-dynamic";

export default function NewJourneyRulePage() {
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-journey">Guest journey</Link> /{" "}
            <Link href="/dashboard/guest-journey/rules">Rules</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New journey rule</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Choose stage + anchor + offset. The runner will materialise one
            (booking, rule) row per active booking and dispatch when
            scheduled_for arrives.
          </p>
        </div>
      </div>

      <h2 className="display text-[22px] font-normal mb-3.5">
        Rule definition
      </h2>
      <div className="card px-5 py-[18px]">
        <CreateGuestJourneyRuleForm />
      </div>
    </>
  );
}
