import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
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
        <div className="page-header">
          <div className="left">
            <h1>Templates</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/inbox">Inbox</Link> /{" "}
            <span>Templates</span>
          </div>
          <h1>Message templates</h1>
          <div className="page-header-meta">
            <span>
              {templates.length} template{templates.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Reusable per-channel content blocks. Render via {"{{variable}}"}{" "}
            substitution. WhatsApp templates require Meta approval before they
            can be sent — pending status is reflected here once the template
            registers with Meta.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/inbox" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Inbox
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Create template</div>
        <p className="text-[13px] text-ink-3 mt-0 mb-2.5 max-w-[680px]">
          Channels: comma-separated (whatsapp, email, sms…). Content per
          channel: JSON object keyed by channel.
        </p>
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
            <button type="submit" className="btn btn-accent">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              Create template
            </button>
          </div>
        </form>
      </div>

      <div>
        <div className="label mb-2.5">Existing templates</div>
        {templates.length === 0 ? (
          <EmptyState
            title="No templates yet"
            description="Create your first template above. They show up here once active."
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Name</th>
                  <th scope="col">Channels</th>
                  <th scope="col">Variables</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const archiveBound = archiveTemplateAction.bind(null, t.id);
                  return (
                    <tr key={t.id}>
                      <td className="font-mono text-xs">{t.code}</td>
                      <td className="row-title">{t.name}</td>
                      <td className="text-xs">
                        {(t.supportedChannels as string[]).join(", ")}
                      </td>
                      <td className="text-xs">
                        {((t.variables as string[]) ?? []).join(", ") || "—"}
                      </td>
                      <td>
                        <HandoffBadge
                          tone={t.status === "active" ? "ok" : "soft"}
                        >
                          {t.status}
                        </HandoffBadge>
                      </td>
                      <td className="text-right">
                        {t.status !== "archived" && (
                          <form action={archiveBound}>
                            <button
                              type="submit"
                              className="btn btn-secondary btn-sm"
                            >
                              Archive
                            </button>
                          </form>
                        )}
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
