import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listContent } from "@/lib/development/server/content/content-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Content calendar · Marketing",
};
export const dynamic = "force-dynamic";

export default async function ContentCalendarPage() {
  const rows = await safeQuery(
    "scheduledContent",
    listContent({ status: ["scheduled", "approved"], limit: 200 }),
    [],
  );
  const grouped: Record<string, typeof rows> = {};
  for (const r of rows) {
    if (!r.scheduledPublishAt) continue;
    const day = new Date(r.scheduledPublishAt).toISOString().slice(0, 10);
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(r);
  }
  const days = Object.keys(grouped).sort();
  return (
    <DevelopmentShell>
      <PageHeader
        title="Content calendar"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Content", href: "/development-os/marketing/content" },
          { label: "Calendar" },
        ]}
        description={`${rows.length} scheduled or approved piece(s).`}
      />
      <Section title="Upcoming">
        {days.length === 0 ? (
          <EmptyState
            title="No scheduled content"
            description="Schedule content from the pipeline view."
          />
        ) : (
          <div className="space-y-4">
            {days.map((d) => (
              <div key={d}>
                <h3 className="text-label mb-2">{d}</h3>
                <ul className="text-sm space-y-1">
                  {grouped[d].map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/development-os/marketing/content/${c.contentCode}`}
                        className="hover:underline"
                      >
                        <span className="font-mono text-xs text-ink-tertiary">
                          {c.contentCode}
                        </span>{" "}
                        {c.title}{" "}
                        <span className="text-xs text-ink-tertiary">({c.contentType})</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
    </DevelopmentShell>
  );
}
