import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function InvestorPortalRoot() {
  redirect("/investor-portal/dashboard");
}
