import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GuestShell } from "@/components/layout/guest-shell";
import { Section } from "@/components/ui/section";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";
import { listGuestVisibleServices } from "@/features/guest-services/services";
import {
  ServicesCatalog,
  type CatalogService,
} from "@/components/stay/services-catalog";
import { GuestServiceRequestForm } from "@/components/stay/service-request-form";
import type { PricingModel } from "@/features/guest-services/pricing";

export const metadata = { title: "Concierge & services" };
export const dynamic = "force-dynamic";

export default async function ServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ service?: string }>;
}) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  const focusKey = sp.service?.trim() || null;
  const result = await getGuestStaySummaryByToken(token);
  if (!result.ok) notFound();
  const stay = result.summary.base;
  const villaLabel = stay.villaName ?? stay.villaCode ?? "Your villa";

  const visible = await listGuestVisibleServices({
    villaId: stay.villaId,
    projectId: stay.projectId,
  });
  const catalog: CatalogService[] = visible.map((v) => ({
    ...v,
    pricingModel: v.pricingModel as PricingModel,
  }));
  const focusedService = focusKey
    ? catalog.find((s) => s.serviceKey === focusKey)
    : null;

  return (
    <GuestShell
      villaName={villaLabel}
      dates={`${stay.checkIn} → ${stay.checkOut}`}
    >
      <div className="flex flex-col gap-8">
        <Link
          href={`/stay/${token}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Stay home
        </Link>
        <header className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Concierge
          </span>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            Services & extras
          </h1>
          <p className="text-sm text-ink-secondary max-w-prose">
            Tap any service to send a request. Our team confirms availability,
            timing and final price within a few hours.
          </p>
        </header>

        {focusedService && (
          <Section
            eyebrow="Recommended"
            title={focusedService.name}
            description="From your stay timeline."
          >
            <p className="text-sm text-ink-secondary">
              {focusedService.shortDescription ??
                focusedService.descriptionMd ??
                "Open the service below to send a request."}
            </p>
          </Section>
        )}

        <ServicesCatalog token={token} services={catalog} />

        <Section
          eyebrow="Custom"
          title="Need something we don't list?"
          description="Send a free-text request and the concierge will get back to you."
        >
          <GuestServiceRequestForm token={token} />
        </Section>
      </div>
    </GuestShell>
  );
}
