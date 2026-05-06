import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getWhatsappMessage } from "@/lib/development/server/whatsapp-actions";

export const metadata: Metadata = {
  title: "WhatsApp message · Development OS",
};
export const dynamic = "force-dynamic";

export default async function WhatsappMessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="WhatsApp message" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const msg = await getWhatsappMessage(id);
  if (!msg) notFound();

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "WhatsApp", href: "/development-os/whatsapp" },
          { label: id.slice(0, 8) },
        ]}
        eyebrow={`${msg.direction} · ${msg.status}`}
        title={msg.templateName ?? "WhatsApp message"}
        description={
          msg.aiIntent
            ? `AI intent: ${msg.aiIntent} (confidence ${msg.aiIntentConfidence ?? "?"})`
            : undefined
        }
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/whatsapp">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All messages
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Header" title="Message envelope">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Field label="Provider" value={msg.provider} />
          <Field label="External SID" value={msg.externalMessageSid ?? "—"} />
          <Field label="From" value={msg.fromPhone} />
          <Field label="To" value={msg.toPhone} />
          <Field label="Type" value={msg.messageType} />
          <Field label="Status" value={msg.status} />
          <Field
            label="Occurred at"
            value={msg.occurredAt.toISOString().slice(0, 19).replace("T", " ")}
          />
          <Field
            label="Status updated"
            value={msg.statusUpdatedAt.toISOString().slice(0, 19).replace("T", " ")}
          />
          {msg.failureReason && (
            <Field label="Failure reason" value={msg.failureReason} />
          )}
        </div>
      </Section>

      {msg.body && (
        <Section eyebrow="Body" title="Text content">
          <div className="rounded-md border border-line-soft bg-surface p-4 whitespace-pre-wrap text-sm">
            {msg.body}
          </div>
        </Section>
      )}

      {msg.voiceTranscript && (
        <Section eyebrow="Voice" title="Transcription">
          <div className="rounded-md border border-line-soft bg-surface p-4 text-sm">
            <p className="whitespace-pre-wrap">{msg.voiceTranscript}</p>
            <p className="text-[11px] text-ink-tertiary mt-2">
              Language: {msg.voiceTranscriptLanguage ?? "?"}
              {msg.voiceTranscribedAt
                ? ` · Transcribed ${msg.voiceTranscribedAt.toISOString().slice(0, 19).replace("T", " ")}`
                : ""}
            </p>
          </div>
        </Section>
      )}

      {msg.mediaUrls && msg.mediaUrls.length > 0 && (
        <Section eyebrow="Media" title={`${msg.mediaUrls.length} attachment${msg.mediaUrls.length === 1 ? "" : "s"}`}>
          <ul className="space-y-1 text-xs">
            {msg.mediaUrls.map((u, i) => (
              <li key={i}>
                <a
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-info hover:underline break-all"
                >
                  {u}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {msg.templateName && (
        <Section eyebrow="Template" title={msg.templateName}>
          {msg.templateVariables != null && (
            <pre className="text-xs bg-muted/30 p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(msg.templateVariables, null, 2)}
            </pre>
          )}
        </Section>
      )}

      {(msg.createdSiteReportId || msg.createdInvestorQaId || msg.deliveryLogId) && (
        <Section eyebrow="Linked" title="Created entities">
          <ul className="text-sm space-y-1">
            {msg.createdSiteReportId && (
              <li>
                <Link
                  href={`/development-os/site-reports/${msg.createdSiteReportId}`}
                  className="text-info hover:underline"
                >
                  Site report draft → {msg.createdSiteReportId}
                </Link>
              </li>
            )}
            {msg.createdInvestorQaId && (
              <li>
                <span className="text-ink-secondary">
                  Investor Q&amp;A draft → {msg.createdInvestorQaId}
                </span>
              </li>
            )}
            {msg.deliveryLogId && (
              <li>
                <span className="text-ink-secondary">
                  Notification delivery log → {msg.deliveryLogId}
                </span>
              </li>
            )}
          </ul>
        </Section>
      )}

      {msg.webhookRawPayload != null && (
        <Section eyebrow="Audit" title="Webhook raw payload">
          <pre className="text-xs bg-muted/30 p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(msg.webhookRawPayload, null, 2)}
          </pre>
          <p className="text-[11px] text-ink-tertiary mt-2">
            Signature verified:{" "}
            {msg.webhookSignatureVerified === true
              ? "yes"
              : msg.webhookSignatureVerified === false
                ? "no"
                : "n/a"}
          </p>
        </Section>
      )}
    </DevelopmentShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="text-sm font-mono break-all mt-0.5">{value}</div>
    </div>
  );
}
