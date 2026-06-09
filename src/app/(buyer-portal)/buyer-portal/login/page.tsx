import type { Metadata } from "next";

export const metadata: Metadata = { title: "Login · Buyer Portal" };
export const dynamic = "force-dynamic";

export default function BuyerLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-line-soft bg-surface p-8 shadow-sm space-y-6">
        <div className="text-center">
          <h1 className="font-display text-2xl tracking-wide text-ink">
            ARCONIQUE
          </h1>
          <p className="text-xs text-ink-tertiary mt-1">Villa buyer portal</p>
        </div>

        <p className="text-sm text-ink-secondary">
          Buyer portal access is invitation-only. Once Arconique sends you the
          welcome email, click the link there to set your password and sign in.
        </p>

        <div className="rounded-md border border-line-soft bg-muted p-4 text-xs text-ink-secondary">
          <p className="font-medium text-ink mb-1">Already invited?</p>
          <p>
            Use the magic link in your invitation email — it logs you in
            without a separate password step.
          </p>
        </div>

        <p className="text-[11px] text-ink-tertiary text-center">
          Need help? Email{" "}
          <a href="mailto:hello@arconique.com" className="underline">
            hello@arconique.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
