import type { Metadata } from "next";

export const metadata: Metadata = { title: "Login · Buyer Portal" };
export const dynamic = "force-dynamic";

export default function BuyerLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-stone-300 bg-white p-8 shadow-sm space-y-6">
        <div className="text-center">
          <h1 className="font-display text-2xl tracking-wide text-stone-900">
            ARCONIQUE
          </h1>
          <p className="text-xs text-stone-500 mt-1">Villa buyer portal</p>
        </div>

        <p className="text-sm text-stone-700">
          Buyer portal access is invitation-only. Once Arconique sends you the
          welcome email, click the link there to set your password and sign in.
        </p>

        <div className="rounded-md border border-stone-200 bg-stone-50 p-4 text-xs text-stone-600">
          <p className="font-medium text-stone-700 mb-1">Already invited?</p>
          <p>
            Use the magic link in your invitation email — it logs you in
            without a separate password step.
          </p>
        </div>

        <p className="text-[11px] text-stone-500 text-center">
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
