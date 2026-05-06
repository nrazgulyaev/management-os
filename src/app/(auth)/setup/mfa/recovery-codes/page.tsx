import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getMfaStatus } from "@/features/security-baseline/mfa-services";

export const metadata = { title: "Recovery codes" };
export const dynamic = "force-dynamic";

export default async function MfaRecoveryCodesPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login?next=/setup/mfa/recovery-codes");
  const status = await getMfaStatus(me.id);
  return (
    <div className="max-w-xl mx-auto py-12 px-6 flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Setup" },
          { label: "MFA" },
          { label: "Recovery codes" },
        ]}
        title="Recovery codes"
        description="If you lose access to your authenticator, you can use a recovery code to sign in once."
      />
      <Section eyebrow="Status" title="Your codes">
        <p className="text-sm text-ink-secondary leading-relaxed">
          You have <strong>{status.activeRecoveryCodeCount}</strong> active
          recovery codes remaining. We never re-display the codes after
          enrolment — if you have lost yours, ask a super_admin / director to
          revoke your factor and re-enrol.
        </p>
        <Link
          href="/dashboard/settings/security"
          className="text-xs text-ink hover:underline underline-offset-4"
        >
          Open account security →
        </Link>
      </Section>
    </div>
  );
}
