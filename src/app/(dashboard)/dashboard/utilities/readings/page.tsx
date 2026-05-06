import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { listUtilityReadings } from "@/features/utilities/services";
import { formatBalanceLabel } from "@/features/utilities/risk-pure";

export const metadata = { title: "Utility readings" };
export const dynamic = "force-dynamic";

export default async function ReadingsPage() {
  const rows = await listUtilityReadings({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Utilities", href: "/dashboard/utilities" },
          { label: "Readings" },
        ]}
        title="Utility readings"
      />
      <Section eyebrow="Recent" title={`${rows.length} readings`}>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No readings yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Reading type</th>
                  <th className="text-right px-3 py-2">Value</th>
                  <th className="text-right px-3 py-2">Balance</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {r.readingAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{r.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">{r.utilityType ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{r.readingType}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.readingValue ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatBalanceLabel(r.balanceMinor, r.currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/dashboard/utilities/accounts/${r.utilityAccountId}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Account →
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
