import Link from "next/link";
import { notFound } from "next/navigation";
import { StayShell } from "@/components/layout/stay-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  DEMO_SERVICES,
  DEMO_STAY,
} from "@/features/demo-data/stay-demo-content";

export const metadata = { title: "Service request · demo" };

export default async function StayDemoServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = DEMO_SERVICES.find((s) => s.id === id);
  if (!service) notFound();

  return (
    <StayShell
      villaName={DEMO_STAY.villaName}
      dates="25 Apr → 29 Apr · 4 nights"
      basePath="/stay/demo"
    >
      <div className="flex flex-col gap-8">
        <Link
          href="/stay/demo/services"
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to services
        </Link>

        <header className="flex flex-col gap-2">
          <Badge tone="gold">Demo only · no order will be created</Badge>
          <h1 className="text-display text-[28px] md:text-[36px] font-medium text-ink">
            {service.name}
          </h1>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
            {service.description}
          </p>
          <div className="mt-2 inline-flex items-center gap-2 text-sm">
            <span className="text-label">From</span>
            <span className="font-mono tabular-nums text-ink">
              {service.priceLabel}
            </span>
          </div>
        </header>

        <form
          action="/stay/demo/services"
          className="rounded-lg border border-line-soft bg-surface p-6 flex flex-col gap-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-label">Date</span>
              <input
                type="date"
                name="date"
                disabled
                defaultValue="2026-04-26"
                className="h-10 rounded-md border border-line-soft bg-canvas px-3 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label">Time</span>
              <input
                type="time"
                name="time"
                disabled
                defaultValue="08:30"
                className="h-10 rounded-md border border-line-soft bg-canvas px-3 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label">Guests / quantity</span>
              <input
                type="number"
                name="quantity"
                disabled
                defaultValue={4}
                min={1}
                max={20}
                className="h-10 rounded-md border border-line-soft bg-canvas px-3 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-label">Note</span>
              <textarea
                name="note"
                disabled
                defaultValue="Demo note — would be sent to the concierge team."
                rows={3}
                className="rounded-md border border-line-soft bg-canvas px-3 py-2 text-sm text-ink"
              />
            </label>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-5 py-3 text-xs text-amber-900 leading-relaxed">
            <strong>Demo only.</strong> Submitting this form does not send a
            request. The button is disabled to prevent confusion. In
            production this creates a real <code className="font-mono">guest_service_orders</code> row and notifies the concierge.
          </div>

          <div className="flex justify-end">
            <Button type="button" disabled>
              Add request (demo)
            </Button>
          </div>
        </form>
      </div>
    </StayShell>
  );
}
