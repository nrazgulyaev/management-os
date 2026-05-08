import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Arconique",
  description: "Privacy policy for Arconique Management OS.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink-tertiary">Last updated: 2026-05-07</p>
      <div className="prose prose-sm mt-8 max-w-none text-ink-secondary">
        <p>
          Arconique Management OS collects only the data required to operate
          the Service: account information you provide at sign-up, content you
          create within your tenant organization, and standard application
          telemetry (request logs, error traces, usage metrics).
        </p>
        <p>
          We do not sell or share customer data with third parties for
          advertising. Tenant data is isolated per organization via row-level
          security; service operators access tenant data only when necessary
          for support or compliance.
        </p>
        <p>
          For data deletion, export, or other privacy requests, contact{" "}
          <a href="mailto:privacy@arconique.com" className="underline">
            privacy@arconique.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
