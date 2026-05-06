import { GuestShell } from "@/components/layout/guest-shell";

export function RateLimitedView({
  blockedUntil,
}: {
  blockedUntil: string | null;
}) {
  const minutes = blockedUntil
    ? Math.max(
        1,
        Math.ceil(
          (new Date(blockedUntil).getTime() - Date.now()) / (60 * 1000),
        ),
      )
    : 10;
  return (
    <GuestShell>
      <div className="rounded-xl border border-line-soft bg-surface p-6 md:p-10 mt-12 text-center">
        <h1 className="text-2xl font-medium text-ink">
          Too many requests
        </h1>
        <p className="text-sm text-ink-secondary mt-3 max-w-md mx-auto">
          We&apos;ve paused this stay link for about {minutes} minute
          {minutes === 1 ? "" : "s"} for safety. If you keep seeing this,
          please contact your host or concierge.
        </p>
      </div>
    </GuestShell>
  );
}
