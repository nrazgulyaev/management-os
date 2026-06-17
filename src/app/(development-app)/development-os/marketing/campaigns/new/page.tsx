import { redirect } from "next/navigation";

// Wave-D polish — the real "New campaign" create is the CampaignCreateForm
// modal already mounted in the page header of the campaigns index. There is
// no separate standalone create page, so this /new route redirects to the
// index where the "+ New campaign" trigger lives (replacing the prior
// prose-only "wire to createCampaign" stub).
export const dynamic = "force-dynamic";

export default function NewCampaignPage() {
  redirect("/development-os/marketing/campaigns");
}
