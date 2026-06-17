import { redirect } from "next/navigation";

// Wave-D polish — the real "Add lead source" create is the LeadSourceModalForm
// already mounted in the lead-sources index header. There is no separate
// standalone create page, so this /new route redirects to the index where the
// "Add lead source" trigger lives (replacing the prior prose-only stub).
export const dynamic = "force-dynamic";

export default function NewLeadSourcePage() {
  redirect("/development-os/marketing/lead-sources");
}
