import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { listVillas } from "@/features/villas/services";
import { quoteForRange } from "@/features/pricing/services";
import { buildPublicQuoteResponse } from "@/features/pricing/public-quote";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Rate quote tester" };
export const dynamic = "force-dynamic";

const date = /^\d{4}-\d{2}-\d{2}$/;

export default async function QuoteTesterPage({
  searchParams,
}: {
  searchParams: Promise<{ villaId?: string; checkIn?: string; checkOut?: string }>;
}) {
  const sp = await searchParams;
  const villas = await listVillas();

  const validInput =
    sp.villaId &&
    sp.checkIn &&
    sp.checkOut &&
    date.test(sp.checkIn) &&
    date.test(sp.checkOut) &&
    sp.checkOut > sp.checkIn;

  let result: ReturnType<typeof buildPublicQuoteResponse> | null = null;
  if (validInput) {
    const q = await quoteForRange({
      villaId: sp.villaId!,
      checkIn: sp.checkIn!,
      checkOut: sp.checkOut!,
    });
    result = buildPublicQuoteResponse(q);
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "Rate plans", href: "/dashboard/bookings/rates" },
          { label: "Quote tester" },
        ]}
        title="Rate quote tester"
        description="Submit a (villa, check-in, check-out) and see the same response shape the public /api/v1/quote endpoint returns. Deterministic — same inputs always produce the same numbers."
      />

      <Section eyebrow="Inputs" title="Quote">
        <form className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-label">Villa</span>
            <select
              name="villaId"
              defaultValue={sp.villaId ?? ""}
              required
              className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
            >
              <option value="">Select villa…</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.unitCode} · {v.projectName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-label">Check-in</span>
            <input
              type="date"
              name="checkIn"
              defaultValue={sp.checkIn ?? ""}
              required
              className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-label">Check-out</span>
            <input
              type="date"
              name="checkOut"
              defaultValue={sp.checkOut ?? ""}
              required
              className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
            />
          </label>
          <button
            type="submit"
            className="h-11 px-4 rounded-sm border border-line-soft hover:border-line-strong text-sm"
          >
            Quote
          </button>
        </form>
      </Section>

      {result && (
        <Section eyebrow="Response" title="Result">
          <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Field label="ok" value={String(result.ok)} />
            <Field label="available" value={String(result.available)} />
            <Field label="currency" value={result.currency} />
            <Field label="nights" value={String(result.nights)} />
            <Field
              label="gross"
              value={`${result.grossAmountFormatted} ${result.currency}`}
            />
            <Field label="reason">
              <Badge tone={result.reason === "ok" ? "success" : "warning"}>
                {result.reason}
              </Badge>
            </Field>
            {result.minLosRequired && (
              <Field label="min LOS" value={String(result.minLosRequired)} />
            )}
            {result.warnings.length > 0 && (
              <div className="md:col-span-4">
                <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  warnings
                </div>
                <ul className="text-sm text-ink-secondary mt-1 list-disc pl-5">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {result.nightlyBreakdown.length > 0 && (
            <div className="rounded-md border border-line-soft bg-surface overflow-hidden mt-4">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-right px-3 py-2">Amount</th>
                    <th className="text-left px-3 py-2">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {result.nightlyBreakdown.map((n) => (
                    <tr key={n.date}>
                      <td className="px-3 py-2 text-ink-secondary tabular-nums">
                        {n.date}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {n.amountFormatted} {result.currency}
                      </td>
                      <td className="px-3 py-2 text-ink-tertiary text-xs">
                        {n.source}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="mt-1">{children ?? <span>{value}</span>}</div>
    </div>
  );
}
