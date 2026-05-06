import { GuestShell } from "@/components/layout/guest-shell";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Hold expired" };
export const dynamic = "force-dynamic";

export default async function HoldExpiredPage() {
  return (
    <GuestShell villaName="Arconique">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Badge tone="warning">Expired</Badge>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            Your hold has expired
          </h1>
          <p className="text-sm text-ink-secondary max-w-prose">
            Holds are valid for 15 minutes. Run a new search to start a fresh
            quote — pricing may have changed since.
          </p>
        </header>
        <Section eyebrow="What now" title="Next step">
          <p className="text-sm text-ink-secondary">
            Reach out to{" "}
            <a
              href="mailto:concierge@arconique.com"
              className="text-ink underline underline-offset-4"
            >
              concierge@arconique.com
            </a>{" "}
            if you'd like the team to hold dates for you manually.
          </p>
        </Section>
      </div>
    </GuestShell>
  );
}
