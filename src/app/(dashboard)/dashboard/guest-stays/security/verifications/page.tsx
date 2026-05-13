import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db/client";
import { guestStayTokenVerifications } from "@/lib/db/schema/guest-stay-security";
import { guestStayTokens } from "@/lib/db/schema/guest-stays";
import { bookings } from "@/lib/db/schema/bookings";

export const metadata = { title: "Stay verifications" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  pending: "info",
  verified: "success",
  expired: "neutral",
  failed: "danger",
  cancelled: "neutral",
};

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const rows = db
    ? await db
        .select({
          v: guestStayTokenVerifications,
          tokenPrefix: guestStayTokens.tokenPrefix,
          bookingCode: bookings.bookingCode,
        })
        .from(guestStayTokenVerifications)
        .leftJoin(
          guestStayTokens,
          eq(guestStayTokens.id, guestStayTokenVerifications.guestStayTokenId),
        )
        .leftJoin(bookings, eq(bookings.id, guestStayTokens.bookingId))
        .where(
          sp.status
            ? eq(guestStayTokenVerifications.status, sp.status)
            : undefined,
        )
        .orderBy(desc(guestStayTokenVerifications.createdAt))
        .limit(200)
    : [];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Security", href: "/dashboard/guest-stays/security" },
          { label: "Verifications" },
        ]}
        title="Verifications"
        description="One-time codes issued to gate first access to /stay/[token]. Codes expire in 10 minutes; max 5 attempts each."
      />
      <Section eyebrow="Recent" title={`${rows.length} verifications`}>
        <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Expires</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No verifications yet. Issued automatically when a guest first scans their stay link; expires after 10 minutes.
                  </td>
                </tr>
              )}
              {rows.map(({ v, tokenPrefix, bookingCode }) => (
                <tr key={v.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary tabular-nums whitespace-nowrap">
                    {new Date(v.createdAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {tokenPrefix ? `${tokenPrefix}…` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {bookingCode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">{v.channel}</td>
                  <td className="px-4 py-3 text-xs text-ink-secondary">
                    {v.recipientMasked ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONES[v.status] ?? "neutral"}>
                      {v.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {v.attempts}/{v.maxAttempts}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary tabular-nums">
                    {new Date(v.expiresAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
