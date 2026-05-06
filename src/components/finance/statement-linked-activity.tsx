import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { formatMoneyMinor } from "@/lib/money";
import type { OwnerLinkedActivityRow } from "@/features/statement-transparency/services";

export function StatementLinkedActivity({
  rows,
}: {
  rows: OwnerLinkedActivityRow[];
}) {
  if (rows.length === 0) {
    return (
      <Section
        eyebrow="Linked activity"
        title="No bookings linked yet"
        description="Once direct bookings, OTA stays, owner stays, and services post to this statement, they will appear here."
      >
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No linked bookings or stays for this statement period.
        </p>
      </Section>
    );
  }
  return (
    <Section
      eyebrow="Linked activity"
      title={`${rows.length} stay${rows.length === 1 ? "" : "s"} backing this statement`}
      description="Click through to view each stay's owner-safe summary."
    >
      <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
        {rows.map((r) => (
          <li
            key={r.id}
            className="px-4 py-3 flex items-center justify-between gap-4 text-sm"
          >
            <div className="flex flex-col">
              <span className="text-ink">{r.ownerLabel}</span>
              <span className="text-[11px] text-ink-tertiary font-mono tabular-nums">
                {r.checkIn} → {r.checkOut}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone="info">{r.publicStatus.replace(/_/g, " ")}</Badge>
              {r.ownerRevenueMinor && r.currency && (
                <span className="font-mono tabular-nums text-xs">
                  {formatMoneyMinor(r.ownerRevenueMinor, r.currency)}
                </span>
              )}
              <Link
                href={r.href}
                className="text-xs text-ink hover:underline underline-offset-4"
              >
                Open →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
