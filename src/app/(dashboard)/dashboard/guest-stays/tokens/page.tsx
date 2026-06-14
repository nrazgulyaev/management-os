import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listGuestStayTokens } from "@/features/guest-stays/services";

export const metadata = { title: "Guest stay tokens" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "soft" | "info" | "warn" | "ok" | "danger"> = {
  active: "ok",
  revoked: "warn",
  expired: "soft",
};

export default async function TokensListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listGuestStayTokens({
    status: sp.status || undefined,
    limit: 300,
  });
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-stays">Guest stays</Link> /{" "}
            <span>Tokens</span>
          </div>
          <h1>Guest stay tokens</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            One token per booking → /stay/[token]. We store the SHA-256 hash
            only; the prefix is for admin display. Issue/revoke from a booking's
            guest-stay panel.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          { label: "All", status: undefined },
          { label: "Active", status: "active" },
          { label: "Revoked", status: "revoked" },
          { label: "Expired", status: "expired" },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.status ? `?status=${f.status}` : "?"}
            className={
              (sp.status ?? "") === (f.status ?? "")
                ? "btn btn-accent btn-sm"
                : "btn btn-secondary btn-sm"
            }
          >
            {f.label}
          </Link>
        ))}
      </div>
      <div>
        <div className="label mb-2.5">Tokens</div>
        {rows.length === 0 ? (
          <Card padding="default">
            <p className="text-sm text-ink-3 italic m-0">None.</p>
          </Card>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Booking</th>
                  <th scope="col">Villa</th>
                  <th scope="col">Prefix</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Access</th>
                  <th scope="col">Expires</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="row-title">
                      {r.bookingCode ?? r.bookingId.slice(0, 8)}
                    </td>
                    <td className="text-ink-2">{r.villaCode ?? "—"}</td>
                    <td className="mono text-[12px] text-ink-3">
                      {r.tokenPrefix}…
                    </td>
                    <td>
                      <HandoffBadge tone={STATUS_TONES[r.status] ?? "soft"}>
                        {r.status}
                      </HandoffBadge>
                    </td>
                    <td className="num text-ink-3">
                      {r.accessCount}
                      {r.lastAccessedAt ? (
                        <span className="text-[11px] ml-1">
                          · {r.lastAccessedAt.slice(0, 16).replace("T", " ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="mono text-[12px] text-ink-3">
                      {r.expiresAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/dashboard/guest-stays/tokens/${r.id}`}
                        className="text-xs text-ink hover:text-terra"
                      >
                        Detail →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
