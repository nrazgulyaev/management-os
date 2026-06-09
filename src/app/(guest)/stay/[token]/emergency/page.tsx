import { notFound } from "next/navigation";
import { StayShell } from "@/components/layout/stay-shell";
import { StayHeader } from "@/components/stay/stay-ui";
import { Phone, Mail, ShieldAlert } from "lucide-react";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";

export const metadata = { title: "Emergency contacts" };
export const dynamic = "force-dynamic";

export default async function EmergencyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getGuestStaySummaryByToken(token);
  if (!result.ok) notFound();
  const { summary } = result;
  const villaLabel = summary.base.villaName ?? summary.base.villaCode ?? "Your villa";
  // Lead contact (the villa manager) headlines the emergency banner; the
  // rest list below it.
  const [lead, ...rest] = summary.emergencyContacts;
  return (
    <StayShell
      villaName={villaLabel}
      dates={`${summary.base.checkIn} → ${summary.base.checkOut}`}
      basePath={`/stay/${token}`}
    >
      <div className="flex flex-col gap-6">
        <StayHeader title="Help & contacts" backHref={`/stay/${token}`} />
        {summary.emergencyContacts.length === 0 ? (
          <p className="rounded-[var(--r-md)] border border-dashed border-line-soft bg-muted/40 px-5 py-6 text-sm text-ink-tertiary">
            Emergency contacts are being configured.
          </p>
        ) : (
          <>
            {/* Emergency banner — manager on-call (mockup .emerg). */}
            <section className="rounded-[var(--r-card)] border border-danger/20 bg-danger-weak p-5">
              <div className="flex items-center gap-3.5">
                <span className="w-12 h-12 rounded-[14px] bg-danger flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-6 h-6 text-white" strokeWidth={1.8} />
                </span>
                <div className="flex-1">
                  <div className="text-[16px] font-bold text-danger">
                    {lead?.label ?? "Emergency line"}
                  </div>
                  <div className="text-[13px] text-ink-tertiary mt-0.5">
                    Your villa manager is on call around the clock
                  </div>
                </div>
              </div>
              {lead?.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-danger text-white text-[15px] font-semibold px-[22px] py-[15px]"
                >
                  <Phone className="w-[18px] h-[18px]" strokeWidth={2} />
                  Call the manager
                </a>
              )}
            </section>

            <ul className="flex flex-col gap-3">
              {rest.map((c) => (
                <li
                  key={c.id}
                  className="rounded-[var(--r-md)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-[18px]"
                >
                  <div className="text-[11px] uppercase tracking-[0.2em] text-ink-tertiary font-mono">
                    {c.contactType}
                  </div>
                  <div className="text-ink font-semibold text-[15.5px] mt-1">
                    {c.label}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="inline-flex items-center gap-1 text-ink hover:underline underline-offset-4"
                      >
                        <Phone className="w-3.5 h-3.5" /> {c.phone}
                      </a>
                    )}
                    {c.whatsapp && (
                      <a
                        href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-ink hover:underline underline-offset-4"
                      >
                        WhatsApp
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="inline-flex items-center gap-1 text-ink hover:underline underline-offset-4"
                      >
                        <Mail className="w-3.5 h-3.5" /> {c.email}
                      </a>
                    )}
                  </div>
                  {c.address && (
                    <div className="text-[11px] text-ink-tertiary mt-1">
                      {c.address}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </StayShell>
  );
}
