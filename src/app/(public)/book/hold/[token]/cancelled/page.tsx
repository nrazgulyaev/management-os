import { GuestShell } from "@/components/layout/guest-shell";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Hold cancelled" };
export const dynamic = "force-dynamic";

export default async function HoldCancelledPage() {
  return (
    <GuestShell villaName="Arconique">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Badge tone="neutral">Cancelled</Badge>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            Hold cancelled
          </h1>
          <p className="text-sm text-ink-secondary max-w-prose">
            We've released the dates. You're welcome to start a new search any
            time.
          </p>
        </header>
        <Section eyebrow="Need a hand" title="Concierge">
          <p className="text-sm text-ink-secondary">
            Email{" "}
            <a
              href="mailto:concierge@arconique.com"
              className="text-ink underline underline-offset-4"
            >
              concierge@arconique.com
            </a>{" "}
            if you'd like us to help arrange dates.
          </p>
        </Section>
      </div>
    </GuestShell>
  );
}
