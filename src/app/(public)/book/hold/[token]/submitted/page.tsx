import { GuestShell } from "@/components/layout/guest-shell";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Request received" };
export const dynamic = "force-dynamic";

export default async function HoldSubmittedPage() {
  return (
    <GuestShell villaName="Arconique">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Badge tone="success">Submitted</Badge>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            Your request is under review
          </h1>
          <p className="text-sm text-ink-secondary max-w-prose">
            Our concierge will confirm availability manually within 24 hours.
            You will receive an email once we lock in your dates.
          </p>
        </header>
        <Section eyebrow="What happens next" title="Concierge review">
          <ul className="text-sm text-ink-secondary list-disc pl-5 flex flex-col gap-2">
            <li>We'll double-check the schedule with the on-site team.</li>
            <li>
              Once confirmed, we'll email you a booking-confirmation message
              with check-in details. No payment is collected until then.
            </li>
            <li>
              If we can't accommodate the dates, we'll suggest alternatives
              and release the hold automatically.
            </li>
          </ul>
        </Section>
      </div>
    </GuestShell>
  );
}
