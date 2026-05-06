import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { resolveLandingPageForUserId } from "@/lib/development/server/roles/landing-resolver";

export const dynamic = "force-dynamic";

export default async function MyCabinetRedirectPage() {
  const me = await getCurrentAppUser();
  const target = me
    ? await resolveLandingPageForUserId(me.id)
    : "/development-os/dashboard";
  redirect(target);
}
