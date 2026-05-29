import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · Arconique",
  description: "Terms of service for the Arconique platform.",
};

const LAST_UPDATED = "2026-05-29";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-ink-tertiary">
        Last updated: {LAST_UPDATED}
      </p>

      <div className="mt-6 rounded-lg border border-line-soft bg-muted px-4 py-3 text-xs text-ink-secondary">
        These terms are a standard template for the Arconique platform and have
        not yet been reviewed by counsel for your jurisdiction. They are
        binding on use of the Service but will be superseded by the final
        counsel-reviewed version published before general availability.
      </div>

      <div className="prose prose-sm mt-8 max-w-none text-ink-secondary">
        <h2>1. Agreement</h2>
        <p>
          By creating an account or otherwise accessing or using the Arconique
          platform — including Management OS, Development OS, the Owner Portal,
          and related services (collectively, the &quot;Service&quot;) — you
          agree to be bound by these Terms of Service on behalf of yourself and
          the organization you represent (&quot;you&quot;).
        </p>

        <h2>2. The trial</h2>
        <p>
          New workspaces begin a 14-day free trial. No payment is required to
          start. At the end of the trial your workspace becomes read-only unless
          you select a paid plan. We may change trial length or eligibility for
          future sign-ups.
        </p>

        <h2>3. Accounts &amp; security</h2>
        <p>
          You are responsible for safeguarding your credentials and for all
          activity under your account. Notify us promptly of any unauthorized
          use. We may suspend access where we reasonably believe an account is
          compromised or used in breach of these terms.
        </p>

        <h2>4. Your data</h2>
        <p>
          You retain all rights to the content and records you create in your
          tenant organization (&quot;Customer Data&quot;). You grant Arconique
          the limited rights needed to host, process, back up, and display the
          Customer Data to operate the Service. Tenant data is isolated per
          organization (see our{" "}
          <a href="/legal/privacy" className="underline">
            Privacy Policy
          </a>
          ).
        </p>

        <h2>5. Acceptable use</h2>
        <p>
          You agree not to misuse the Service: no unlawful content, no attempts
          to breach security or access other tenants&apos; data, no
          reverse-engineering, and no use that overloads or disrupts the
          platform.
        </p>

        <h2>6. Fees &amp; payment</h2>
        <p>
          Paid plans are billed in advance on the cadence shown at checkout.
          Fees are non-refundable except where required by law. We will give
          reasonable notice of price changes before they take effect on your
          next renewal.
        </p>

        <h2>7. Termination</h2>
        <p>
          You may cancel at any time; your workspace becomes read-only at the
          end of the paid period. We may suspend or terminate access for
          material breach of these terms. On termination you may export your
          Customer Data for a reasonable period before deletion.
        </p>

        <h2>8. Warranties &amp; liability</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any
          kind to the maximum extent permitted by law. To the extent permitted
          by law, Arconique&apos;s aggregate liability arising out of or
          relating to the Service is limited to the fees you paid in the twelve
          months preceding the claim.
        </p>

        <h2>9. Changes</h2>
        <p>
          We may update these terms. Material changes will be notified in-app or
          by email; continued use after the effective date constitutes
          acceptance.
        </p>

        <h2>10. Contact</h2>
        <p>
          Questions about these terms:{" "}
          <a href="mailto:legal@arconique.com" className="underline">
            legal@arconique.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
