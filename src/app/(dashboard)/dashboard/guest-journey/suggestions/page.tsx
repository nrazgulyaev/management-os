import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listGuestJourneySuggestions } from "@/features/guest-journey/services";

export const metadata = { title: "Journey suggestions" };
export const dynamic = "force-dynamic";

export default async function JourneySuggestionsPage() {
  const rows = await listGuestJourneySuggestions({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest journey", href: "/dashboard/guest-journey" },
          { label: "Suggestions" },
        ]}
        title="Suggestions log"
        description="Suggestions are guest-visible CTAs. They are never purchases — only links into existing surfaces."
      />
      <Section eyebrow="Guest-facing" title={`${rows.length} suggestions`}>
        <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Suggested for</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No suggestions yet.
                  </td>
                </tr>
              )}
              {rows.map(({ suggestion: s, bookingCode, villaCode }) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs">
                    {bookingCode ?? s.bookingId?.slice(0, 8) ?? "—"}
                    <div className="text-[10px] text-ink-tertiary">
                      {villaCode ?? ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{s.suggestionType}</td>
                  <td className="px-4 py-3 text-sm">{s.title}</td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {s.suggestedFor?.toISOString().slice(0, 10) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">{s.priority}</td>
                  <td className="px-4 py-3">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
