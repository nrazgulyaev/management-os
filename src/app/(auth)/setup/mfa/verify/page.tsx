import { redirect } from "next/navigation";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
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
      <SectionHeading
        eyebrow="Setup · MFA · verify"
        title="Verify your authenticator"
        subtitle="Enter the current 6-digit code from your authenticator app."
      />
      <Card style={{ padding: 20 }}>
        <div className="label">Step 2</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Enter the code
        </h2>
        <MfaVerifyForm mode="enrolment" />
      </Card>
    </div>
  );
}
