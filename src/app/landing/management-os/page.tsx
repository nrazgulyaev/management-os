import Link from "next/link";

/**
 * Sprint ARCH-1 — placeholder landing for management.arconique.com.
 *
 * The middleware rewrites `/` on the management subdomain to this
 * route. Replaced by the Claude-Design landing in Step 5 of the
 * Arconique OS redesign.
 */
export const metadata = {
  title: "Arconique Management OS",
  description:
    "Premium villa management, owner reporting, and operations platform.",
};

export default function ManagementOsLandingPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-6 py-16">
      <div className="max-w-2xl text-center flex flex-col gap-7">
        <p className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-medium">
          Arconique
        </p>
        <h1 className="font-display text-[44px] md:text-[60px] leading-[1.05] text-ink-deep">
          Management <span className="italic text-terra">OS</span>
        </h1>
        <p className="text-ink-2 text-[17px] leading-[1.55]">
          Premium villa management, owner reporting, and end-to-end
          operations in one workspace. The full landing experience is
          on the way.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/signup"
            className="px-5 py-2.5 rounded-full bg-ink-deep text-white text-[13.5px] hover:bg-ink"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="px-5 py-2.5 rounded-full border border-line text-ink text-[13.5px] hover:bg-surface-warm"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
