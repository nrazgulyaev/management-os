import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getMfaStatus } from "@/features/security-baseline/mfa-services";
import { MfaVerifyForm } from "@/components/security/mfa-verify-form";

export const metadata = { title: "Verify MFA" };
export const dynamic = "force-dynamic";

export default async function MfaVerifyPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login?next=/setup/mfa/verify");
  const status = await getMfaStatus(me.id);
  if (!status.pendingEnrolment) {
    if (status.verified) {
      redirect("/dashboard/settings/security");
    }
    redirect("/setup/mfa");
  }
  return (
    <div className="max-w-md mx-auto py-12 px-6 flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Setup" }, { label: "MFA" }, { label: "Verify" }]}
        title="Verify your authenticator"
        description="Enter the current 6-digit code from your authenticator app."
      />
      <Section eyebrow="Step 2" title="Enter the code">
        <MfaVerifyForm mode="enrolment" />
      </Section>
    </div>
  );
}
