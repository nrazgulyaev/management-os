import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { listGuestJourneySuggestions } from "@/features/guest-journey/services";
import { DismissSuggestionButton } from "@/components/guest-journey/journey-buttons";

export const metadata = { title: "Journey suggestions" };
export const dynamic = "force-dynamic";

const SUGGESTION_STATUSES = [
  "active",
  "clicked",
  "dismissed",
  "expired",
  "converted",
] as const;
type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

const STATUS_FILTERS: { label: string; status?: SuggestionStatus }[] = [
  { label: "All", status: undefined },
  { label: "Active", status: "active" },
  { label: "Clicked", status: "clicked" },
  { label: "Converted", status: "converted" },
  { label: "Dismissed", status: "dismissed" },
  { label: "Expired", status: "expired" },
];

export default async function JourneySuggestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = SUGGESTION_STATUSES.includes(sp.status as SuggestionStatus)
    ? (sp.status as SuggestionStatus)
    : undefined;
  const rows = await listGuestJourneySuggestions({ status, limit: 200 });
  const activeCount = rows.filter(({ suggestion }) => suggestion.status === "active").length;
  const clickedCount = rows.filter(({ suggestion }) => suggestion.status === "clicked").length;
  const convertedCount = rows.filter(({ suggestion }) => suggestion.status === "converted").length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-journey">Guest journey</Link> /{" "}
            <span>Suggestions</span>
          </div>
          <h1>Suggestions log</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Suggestions are guest-visible CTAs. They are never purchases — only
            links into existing surfaces.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-[18px]">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.status ? `?status=${f.status}` : "?"}
            className={
              (status ?? "") === (f.status ?? "")
                ? "btn btn-accent btn-sm"
                : "btn btn-secondary btn-sm"
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi label="Suggestions · in view" value={String(rows.length)} />
        <Kpi
          label="Active"
          value={String(activeCount)}
          tone={activeCount > 0 ? "accent" : undefined}
        />
        <Kpi label="Clicked" value={String(clickedCount)} />
        <Kpi
          label="Converted"
          value={String(convertedCount)}
          tone={convertedCount > 0 ? "success" : undefined}
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Booking</th>
              <th scope="col">Type</th>
              <th scope="col">Title</th>
              <th scope="col">Suggested for</th>
              <th scope="col">Priority</th>
              <th scope="col">Status</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={7}>No suggestions yet.</TableEmpty>
            ) : (
              rows.map(({ suggestion: s, bookingCode, villaCode }) => (
                <tr key={s.id}>
                  <td className="mono text-[11px] text-ink-3">
                    {bookingCode ?? s.bookingId?.slice(0, 8) ?? "—"}
                    <div className="text-[10px] text-ink-4">
                      {villaCode ?? ""}
                    </div>
                  </td>
                  <td className="text-[12px] text-ink-3">{s.suggestionType}</td>
                  <td>{s.title}</td>
                  <td className="mono text-[11px] text-ink-3">
                    {s.suggestedFor?.toISOString().slice(0, 10) ?? "—"}
                  </td>
                  <td className="text-[12px] text-ink-3 capitalize">{s.priority}</td>
                  <td>
                    <Badge
                      tone={
                        s.status === "active"
                          ? "success"
                          : s.status === "clicked"
                            ? "info"
                            : s.status === "converted"
                              ? "success"
                              : s.status === "dismissed"
                                ? "warning"
                                : "neutral"
                      }
                    >
                      {s.status}
                    </Badge>
                  </td>
                  <td className="text-right">
                    {s.status === "active" || s.status === "clicked" ? (
                      <DismissSuggestionButton id={s.id} />
                    ) : (
                      <span className="text-[11px] text-ink-4">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
