import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Arconique",
  description: "Privacy policy for the Arconique platform.",
};

const LAST_UPDATED = "2026-05-29";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink-tertiary">
        Last updated: {LAST_UPDATED}
      </p>

      <div className="mt-6 rounded-lg border border-line-soft bg-muted px-4 py-3 text-xs text-ink-secondary">
        This policy is a standard template for the Arconique platform and has
        not yet been reviewed by counsel for your jurisdiction. It describes our
        current practices and will be superseded by the final counsel-reviewed
        version published before general availability.
      </div>

      <div className="prose prose-sm mt-8 max-w-none text-ink-secondary">
        <h2>1. What we collect</h2>
        <p>
          We collect only what is needed to operate the Service: (a) account
          information you provide at sign-up (name, work email, organization);
          (b) content and records you create within your tenant organization
          (&quot;Customer Data&quot;); and (c) standard application telemetry
          (request logs, error traces, usage metrics) used to keep the platform
          reliable and secure.
        </p>

        <h2>2. How we use it</h2>
        <p>
          To provide, secure, support, and improve the Service; to communicate
          about your account (e.g. trial status, security notices); and to meet
          legal and compliance obligations. We do not sell your data, and we do
          not share Customer Data with third parties for advertising.
        </p>

        <h2>3. Tenant isolation</h2>
        <p>
          Customer Data is isolated per organization using row-level security.
          Service operators access tenant data only when necessary for support,
          security, or compliance, and such access is logged in our audit trail.
        </p>

        <h2>4. Sub-processors</h2>
        <p>
          We rely on a small set of infrastructure providers (for hosting,
          database, authentication, and email delivery) that process data on our
          behalf under contractual safeguards. A current list is available on
          request.
        </p>

        <h2>5. Retention</h2>
        <p>
          We retain Customer Data for as long as your workspace is active and
          for a reasonable period afterward to allow export, then delete or
          anonymize it. Telemetry is retained on a rolling basis for operational
          and security purposes.
        </p>

        <h2>6. Security</h2>
        <p>
          We use encryption in transit, scoped access controls, multi-factor
          authentication for staff, and audit logging. No system is perfectly
          secure, but we work to protect your data and to notify you of material
          incidents as required by law.
        </p>

        <h2>7. Your rights</h2>
        <p>
          Depending on your jurisdiction you may have rights to access, correct,
          export, or delete personal data. To make a request — or for data
          deletion or export — contact{" "}
          <a href="mailto:privacy@arconique.com" className="underline">
            privacy@arconique.com
          </a>
          .
        </p>

        <h2>8. Changes</h2>
        <p>
          We may update this policy; material changes will be notified in-app or
          by email. The &quot;last updated&quot; date above reflects the current
          version.
        </p>

        <h2>9. Contact</h2>
        <p>
          Privacy questions:{" "}
          <a href="mailto:privacy@arconique.com" className="underline">
            privacy@arconique.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
