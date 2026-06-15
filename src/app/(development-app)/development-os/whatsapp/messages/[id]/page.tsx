import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>WhatsApp message</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const msg = await getWhatsappMessage(id);
  if (!msg) notFound();

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/whatsapp">WhatsApp</Link> /{" "}
            <span>{id.slice(0, 8)}</span>
          </div>
          <h1>{msg.templateName ?? "WhatsApp message"}</h1>
          {msg.aiIntent && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {`AI intent: ${msg.aiIntent} (confidence ${msg.aiIntentConfidence ?? "?"})`}
            </p>
          )}
        </div>
        <div className="actions">
          <Link
            href="/development-os/whatsapp"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All messages
          </Link>
        </div>
      </div>

      <div className="mb-[18px]">
        <div className="label mb-2.5">Header</div>
        <Card padding="default">
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
        </Card>
      </div>

      {msg.body && (
        <div className="mb-[18px]">
          <div className="label mb-2.5">Body</div>
          <Card padding="default">
            <div className="whitespace-pre-wrap text-sm">{msg.body}</div>
          </Card>
        </div>
      )}

      {msg.voiceTranscript && (
        <div className="mb-[18px]">
          <div className="label mb-2.5">Voice</div>
          <Card padding="default">
            <p className="whitespace-pre-wrap text-sm">{msg.voiceTranscript}</p>
            <p className="text-[11px] text-ink-tertiary mt-2">
              Language: {msg.voiceTranscriptLanguage ?? "?"}
              {msg.voiceTranscribedAt
                ? ` · Transcribed ${msg.voiceTranscribedAt.toISOString().slice(0, 19).replace("T", " ")}`
                : ""}
            </p>
          </Card>
        </div>
      )}

      {msg.mediaUrls && msg.mediaUrls.length > 0 && (
        <div className="mb-[18px]">
          <div className="label mb-2.5">Media</div>
          <Card padding="default">
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
          </Card>
        </div>
      )}

      {msg.templateName && (
        <div className="mb-[18px]">
          <div className="label mb-2.5">Template</div>
          <Card padding="default">
            {msg.templateVariables != null && (
              <pre className="text-xs bg-muted/30 p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(msg.templateVariables, null, 2)}
              </pre>
            )}
          </Card>
        </div>
      )}

      {(msg.createdSiteReportId || msg.createdInvestorQaId || msg.deliveryLogId) && (
        <div className="mb-[18px]">
          <div className="label mb-2.5">Linked</div>
          <Card padding="default">
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
          </Card>
        </div>
      )}

      {msg.webhookRawPayload != null && (
        <div className="mb-[18px]">
          <div className="label mb-2.5">Audit</div>
          <Card padding="default">
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
          </Card>
        </div>
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
