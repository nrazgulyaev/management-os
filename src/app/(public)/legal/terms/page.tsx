import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · Arconique",
  description: "Terms of service for Arconique Management OS.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-ink-tertiary">Last updated: 2026-05-07</p>
      <div className="prose prose-sm mt-8 max-w-none text-ink-secondary">
        <p>
          By accessing or using Arconique Management OS (the &quot;Service&quot;),
          you agree to be bound by these terms. The Service is currently in
          private preview; full legal terms will be published before general
          availability.
        </p>
        <p>
          The Service is provided as-is. Arconique reserves the right to modify
          or discontinue features at any time during the preview period.
        </p>
        <p>
          For questions about these terms, contact{" "}
          <a href="mailto:legal@arconique.com" className="underline">
            legal@arconique.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
