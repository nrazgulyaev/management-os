import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import {
  listEmergencyContactsAdmin,
  listGuideSectionsAdmin,
  listNeighborhoodAdmin,
  listWifiAdmin,
} from "@/features/villa-guides/services";

export const metadata = { title: "Villa guides" };
export const dynamic = "force-dynamic";

export default async function VillaGuidesHub() {
  const [sections, wifi, contacts, places] = await Promise.all([
    listGuideSectionsAdmin(),
    listWifiAdmin(),
    listEmergencyContactsAdmin(),
    listNeighborhoodAdmin(),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Villa guides" }]}
        title="Villa guides"
        description="Edit the guest-facing content surfaced at /stay/[token]. Villa-scoped rows beat project-scoped rows at the same key — operators can configure a project default and override per villa."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Sections" value={String(sections.length)} />
        <MetricCard label="Wi-Fi entries" value={String(wifi.length)} />
        <MetricCard label="Emergency contacts" value={String(contacts.length)} />
        <MetricCard label="Neighborhood places" value={String(places.length)} />
      </div>
      <Section eyebrow="Surfaces" title="Jump to">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card href="/dashboard/villa-guides/sections" title="Sections" detail="Check-in, house rules, transport, …" />
          <Card href="/dashboard/villa-guides/wifi" title="Wi-Fi" detail="Network name + display password" />
          <Card href="/dashboard/villa-guides/emergency-contacts" title="Emergency contacts" detail="Police, hospital, concierge, manager" />
          <Card href="/dashboard/villa-guides/neighborhood" title="Neighborhood" detail="Restaurants, beaches, transport" />
        </div>
      </Section>
    </div>
  );
}

function Card({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-line-soft bg-surface p-5 hover:border-line-strong transition-colors block"
    >
      <div className="text-ink font-medium text-base">{title}</div>
      <div className="text-sm text-ink-secondary mt-1">{detail}</div>
    </Link>
  );
}
