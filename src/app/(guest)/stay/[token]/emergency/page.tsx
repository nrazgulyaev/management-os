import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestShell } from "@/components/layout/guest-shell";
import { ArrowLeft, Phone, Mail } from "lucide-react";
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
  return (
    <GuestShell villaName={villaLabel} dates={`${summary.base.checkIn} → ${summary.base.checkOut}`}>
      <div className="flex flex-col gap-6">
        <Link
          href={`/stay/${token}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Stay home
        </Link>
        <h1 className="text-2xl font-medium text-ink">Safety & contacts</h1>
        {summary.emergencyContacts.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            Emergency contacts are being configured.
          </p>
        ) : (
          <ul className="rounded-xl border border-line-soft bg-surface divide-y divide-line-soft">
            {summary.emergencyContacts.map((c) => (
              <li key={c.id} className="p-4">
                <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  {c.contactType}
                </div>
                <div className="text-ink font-medium text-sm mt-1">{c.label}</div>
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
                  <div className="text-[11px] text-ink-tertiary mt-1">{c.address}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </GuestShell>
  );
}
