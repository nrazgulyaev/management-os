import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { StayShell } from "@/components/layout/stay-shell";
import { StayHeader, Eyebrow } from "@/components/stay/stay-ui";
import { Section } from "@/components/ui/section";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { hashStayToken } from "@/features/guest-stays/token";
import { RateLimitedView } from "@/components/stay/rate-limited";
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
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // Rate limit before doing any DB work for the resolver (mirrors the stay
  // home page `/stay/[token]`).
  const tokenPrefix = token.slice(0, 8);
  const rl = await rateLimitStayTokenAccess({ tokenPrefix, ip });
  if (!rl.allowed) {
    return <RateLimitedView blockedUntil={rl.blockedUntil.toISOString()} />;
  }

  // Verification gate (v9G): an unverified token must not reach the services
  // catalogue or the request form. Redirect into /verify, same as page.tsx.
  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) {
    redirect(`/stay/${token}/verify`);
  }

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
    <StayShell
      villaName={villaLabel}
      dates={`${stay.checkIn} → ${stay.checkOut}`}
      basePath={`/stay/${token}`}
    >
      <div className="flex flex-col gap-8">
        <StayHeader title="Services & orders" backHref={`/stay/${token}`} />
        <header className="flex flex-col gap-2">
          <Eyebrow>Concierge</Eyebrow>
          <p className="text-[14.5px] text-ink-secondary leading-[1.5] max-w-prose">
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
    </StayShell>
  );
}
