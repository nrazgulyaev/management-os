import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { guestStayTokenVerifications } from "@/lib/db/schema/guest-stay-security";
import { guestStayTokens } from "@/lib/db/schema/guest-stays";
import { bookings } from "@/lib/db/schema/bookings";

export const metadata = { title: "Stay verifications" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "soft" | "info" | "warn" | "ok" | "danger"
> = {
  pending: "info",
  verified: "ok",
  expired: "soft",
  failed: "danger",
  cancelled: "soft",
};

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const organizationId = await requireOrgId();
  const rows = db
    ? await db
        .select({
          v: guestStayTokenVerifications,
          tokenPrefix: guestStayTokens.tokenPrefix,
          bookingCode: bookings.bookingCode,
        })
        .from(guestStayTokenVerifications)
        .innerJoin(
          guestStayTokens,
          eq(guestStayTokens.id, guestStayTokenVerifications.guestStayTokenId),
        )
        .leftJoin(bookings, eq(bookings.id, guestStayTokens.bookingId))
        .where(
          and(
            eq(guestStayTokens.organizationId, organizationId),
            sp.status
              ? eq(guestStayTokenVerifications.status, sp.status)
              : undefined,
          ),
        )
        .orderBy(desc(guestStayTokenVerifications.createdAt))
        .limit(200)
    : [];

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <Link href="/dashboard/guest-stays/security">Security</Link> /{" "}
            <span>Verifications</span>
          </div>
          <h1>Verifications</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            One-time codes issued to gate first access to /stay/[token]. Codes
            expire in 10 minutes; max 5 attempts each.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Recent</div>
        <div className="card p-0 overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Token</th>
                <th scope="col">Booking</th>
                <th scope="col">Channel</th>
                <th scope="col">Recipient</th>
                <th scope="col">Status</th>
                <th scope="col">Attempts</th>
                <th scope="col">Expires</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-ink-3">
                    No verifications yet. Issued automatically when a guest first scans their stay link; expires after 10 minutes.
                  </td>
                </tr>
              )}
              {rows.map(({ v, tokenPrefix, bookingCode }) => (
                <tr key={v.id}>
                  <td className="mono text-[12px] text-ink-3">
                    {new Date(v.createdAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                  <td className="mono text-[12px]">
                    {tokenPrefix ? `${tokenPrefix}…` : "—"}
                  </td>
                  <td className="mono text-[12px]">
                    {bookingCode ?? "—"}
                  </td>
                  <td className="text-[12px]">{v.channel}</td>
                  <td className="text-[12px] text-ink-3">
                    {v.recipientMasked ?? "—"}
                  </td>
                  <td>
                    <HandoffBadge tone={STATUS_TONES[v.status] ?? "soft"}>
                      {v.status}
                    </HandoffBadge>
                  </td>
                  <td className="num text-[12px]">
                    {v.attempts}/{v.maxAttempts}
                  </td>
                  <td className="mono text-[12px] text-ink-3">
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
      </div>
    </div>
  );
}
