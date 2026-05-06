import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";
import { MarkdownBlock } from "@/components/stay/markdown-block";

export const metadata = { title: "Stay · Offline page" };
export const dynamic = "force-dynamic";

export default async function OfflinePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getGuestStaySummaryByToken(token);
  if (!result.ok) notFound();
  const { summary } = result;
  const villaLabel = summary.base.villaName ?? summary.base.villaCode ?? "Your villa";
  const checkInSection = summary.sections.find((s) => s.sectionKey === "check_in");
  const houseRulesSection = summary.sections.find((s) => s.sectionKey === "house_rules");
  const wifi = summary.wifi[0];
  const concierge = summary.emergencyContacts.find((c) => c.contactType === "concierge")
    ?? summary.emergencyContacts.find((c) => c.contactType === "manager")
    ?? null;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[720px] mx-auto px-5 md:px-8 py-8 print:py-4 print:px-0">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <Link
            href={`/stay/${token}`}
            className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Stay home
          </Link>
          <a
            href="javascript:window.print()"
            className="inline-flex items-center gap-1.5 text-xs text-ink hover:underline underline-offset-4"
          >
            <Printer className="w-3.5 h-3.5" /> Print or save as PDF
          </a>
        </div>

        <header>
          <p className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Offline guest sheet
          </p>
          <h1 className="text-2xl md:text-3xl font-medium text-ink mt-2">
            {villaLabel}
          </h1>
          {summary.base.projectName && (
            <p className="text-sm text-ink-tertiary mt-1">{summary.base.projectName}</p>
          )}
          <p className="text-sm text-ink-secondary mt-2">
            {summary.base.checkIn} → {summary.base.checkOut} · {summary.base.nights}{" "}
            nights
          </p>
        </header>

        {checkInSection && (
          <section className="mt-8">
            <h2 className="text-lg font-medium text-ink mb-2">{checkInSection.title}</h2>
            <MarkdownBlock source={checkInSection.bodyMd} />
          </section>
        )}

        {wifi && (
          <section className="mt-8">
            <h2 className="text-lg font-medium text-ink mb-2">Wi-Fi</h2>
            <p className="text-sm text-ink-secondary">
              <strong>{wifi.networkName}</strong>
              {wifi.hasPassword
                ? " · password: visit the Wi-Fi page in the portal to reveal."
                : ""}
            </p>
            {wifi.instructionsMd && (
              <div className="mt-2">
                <MarkdownBlock source={wifi.instructionsMd} />
              </div>
            )}
          </section>
        )}

        {houseRulesSection && (
          <section className="mt-8">
            <h2 className="text-lg font-medium text-ink mb-2">{houseRulesSection.title}</h2>
            <MarkdownBlock source={houseRulesSection.bodyMd} />
          </section>
        )}

        {concierge && (
          <section className="mt-8">
            <h2 className="text-lg font-medium text-ink mb-2">Concierge</h2>
            <p className="text-sm text-ink-secondary">
              <strong>{concierge.label}</strong>
              {concierge.phone ? ` · ${concierge.phone}` : ""}
              {concierge.whatsapp ? ` · WhatsApp ${concierge.whatsapp}` : ""}
              {concierge.email ? ` · ${concierge.email}` : ""}
            </p>
          </section>
        )}

        {summary.emergencyContacts.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-medium text-ink mb-2">Emergency</h2>
            <ul className="text-sm text-ink-secondary list-disc pl-5 space-y-1">
              {summary.emergencyContacts.map((c) => (
                <li key={c.id}>
                  <strong>{c.label}</strong>
                  {c.contactType ? ` (${c.contactType})` : ""}
                  {c.phone ? ` · ${c.phone}` : ""}
                  {c.address ? ` · ${c.address}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
