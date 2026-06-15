import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getWhatsappTemplates } from "@/lib/development/server/whatsapp-actions";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "WhatsApp templates · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  draft: "info",
  pending_approval: "warn",
  approved: "ok",
  rejected: "danger",
  inactive: "soft",
};

export default async function WhatsappTemplatesPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>WhatsApp templates</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const templates = await safeQuery(
    "getWhatsappTemplates",
    getWhatsappTemplates(),
    [],
    4000,
  );
  const counts = templates.reduce<Record<string, number>>((acc, t) => {
    acc[t.approvalStatus] = (acc[t.approvalStatus] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/whatsapp">WhatsApp</Link> /{" "}
            <span>Templates</span> /{" "}
            <span>{`${templates.length} templates · ${counts.approved ?? 0} approved`}</span>
          </div>
          <h1>WhatsApp message templates</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Pre-approved templates required for proactive outbound messaging
            outside the 24h conversation window. Submit to Meta via Twilio
            Console for approval (typically 24-48h).
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/whatsapp"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            WhatsApp
          </Link>
        </div>
      </div>

      <div className="mb-[18px]">
        <div className="label mb-2.5">Catalog</div>
        {templates.length === 0 ? (
          <EmptyState
            title="No templates registered"
            description="Add your first WhatsApp template to enable outbound messaging."
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  <th scope="col">Display name</th>
                  <th scope="col">Languages</th>
                  <th scope="col">Variables</th>
                  <th scope="col">Trigger event</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const langs = Object.keys(
                    (t.languageVersions as Record<string, unknown>) ?? {},
                  );
                  return (
                    <tr key={t.id}>
                      <td className="mono text-xs">{t.templateKey}</td>
                      <td className="text-sm">{t.displayName}</td>
                      <td className="text-xs">
                        {langs.length > 0
                          ? langs.map((l) => l.toUpperCase()).join(" · ")
                          : "—"}
                      </td>
                      <td className="text-xs">
                        {t.expectedVariables && t.expectedVariables.length > 0
                          ? t.expectedVariables.join(", ")
                          : "—"}
                      </td>
                      <td className="text-xs">
                        {t.notificationEventType ?? "—"}
                      </td>
                      <td>
                        <HandoffBadge tone={STATUS_TONE[t.approvalStatus] ?? "soft"}>
                          {t.approvalStatus}
                        </HandoffBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
