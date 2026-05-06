import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listGuestStayTokens } from "@/features/guest-stays/services";

export const metadata = { title: "Guest stay tokens" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  active: "success",
  revoked: "warning",
  expired: "neutral",
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
      <PageHeader
        breadcrumbs={[
          { label: "Guest stays", href: "/dashboard/guest-stays" },
          { label: "Tokens" },
        ]}
        title="Guest stay tokens"
        description="One token per booking → /stay/[token]. We store the SHA-256 hash only; the prefix is for admin display. Issue/revoke from a booking's guest-stay panel."
      />
      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-widest">
        {[
          { label: "All", status: undefined },
          { label: "Active", status: "active" },
          { label: "Revoked", status: "revoked" },
          { label: "Expired", status: "expired" },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.status ? `?status=${f.status}` : "?"}
            className={`px-3 py-1.5 rounded-full border ${
              (sp.status ?? "") === (f.status ?? "")
                ? "bg-ink text-ink-inverse border-ink"
                : "border-line-soft text-ink-secondary hover:border-line-strong"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <Section eyebrow="Tokens" title={`${rows.length} rows`}>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            None.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Booking</th>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Prefix</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Access</th>
                  <th className="text-left px-3 py-2">Expires</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink font-medium">
                      {r.bookingCode ?? r.bookingId.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{r.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-tertiary">
                      {r.tokenPrefix}…
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-tertiary">
                      {r.accessCount}
                      {r.lastAccessedAt ? (
                        <span className="text-[11px] ml-1">
                          · {r.lastAccessedAt.slice(0, 16).replace("T", " ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {r.expiresAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/dashboard/guest-stays/tokens/${r.id}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
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
      </Section>
    </div>
  );
}
