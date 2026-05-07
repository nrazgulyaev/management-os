import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listTemplates } from "@/lib/messaging/queries";
import {
  createTemplateAction,
  archiveTemplateAction,
} from "@/lib/messaging/inbox-actions";

export const metadata: Metadata = { title: "Message templates · Inbox" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Templates" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const templates = await listTemplates({ activeOnly: false });

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Inbox", href: "/development-os/inbox" },
          { label: "Templates" },
        ]}
        eyebrow={`${templates.length} template${templates.length === 1 ? "" : "s"}`}
        title="Message templates"
        description="Reusable per-channel content blocks. Render via {{variable}} substitution. WhatsApp templates require Meta approval before they can be sent — pending status is reflected here once the template registers with Meta."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/inbox">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Inbox
            </Link>
          </Button>
        }
      />

      <Section
        title="Create template"
        description="Channels: comma-separated (whatsapp, email, sms…). Content per channel: JSON object keyed by channel."
      >
        <form
          action={createTemplateAction}
          className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border border-line-soft bg-surface p-3 text-sm"
          data-testid="messaging-template-create-form"
        >
          <Field label="Code">
            <input
              type="text"
              name="code"
              required
              placeholder="welcome_inquiry"
              className={inputCls}
            />
          </Field>
          <Field label="Name">
            <input
              type="text"
              name="name"
              required
              placeholder="Welcome inquiry"
              className={inputCls}
            />
          </Field>
          <Field label="Description" className="md:col-span-2">
            <input type="text" name="description" className={inputCls} />
          </Field>
          <Field label="Supported channels (comma-separated)">
            <input
              type="text"
              name="supportedChannels"
              required
              placeholder="whatsapp,email"
              className={inputCls}
            />
          </Field>
          <Field label="Variables (comma-separated)">
            <input
              type="text"
              name="variables"
              placeholder="guest_name,villa_name"
              className={inputCls}
            />
          </Field>
          <Field
            label="Content per channel (JSON)"
            className="md:col-span-2"
          >
            <textarea
              name="contentPerChannel"
              required
              rows={4}
              placeholder='{"whatsapp":"Hi {{guest_name}}, thanks for asking about {{villa_name}}!","email":"Hello {{guest_name}}…"}'
              className={inputCls + " font-mono"}
            />
          </Field>
          <Field label="WhatsApp template name (Meta-approved)">
            <input
              type="text"
              name="whatsappTemplateName"
              placeholder="welcome_inquiry_v1"
              className={inputCls}
            />
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" variant="primary">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              Create template
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Existing templates">
        {templates.length === 0 ? (
          <EmptyState
            title="No templates yet"
            description="Create your first template above. They show up here once active."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Channels</TH>
                <TH>Variables</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {templates.map((t) => {
                const archiveBound = archiveTemplateAction.bind(null, t.id);
                return (
                  <TR key={t.id}>
                    <TD className="font-mono text-xs">{t.code}</TD>
                    <TD>{t.name}</TD>
                    <TD className="text-xs">
                      {(t.supportedChannels as string[]).join(", ")}
                    </TD>
                    <TD className="text-xs">
                      {((t.variables as string[]) ?? []).join(", ") || "—"}
                    </TD>
                    <TD>
                      <Badge tone={t.status === "active" ? "success" : "neutral"}>
                        {t.status}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      {t.status !== "archived" && (
                        <form action={archiveBound}>
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                          >
                            Archive
                          </Button>
                        </form>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}

const inputCls =
  "w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-ink-secondary text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}
