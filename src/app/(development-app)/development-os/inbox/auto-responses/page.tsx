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
import { listAutoResponseRules } from "@/lib/messaging/queries";
import {
  createAutoResponseRuleAction,
  setRuleActiveAction,
} from "@/lib/messaging/inbox-actions";

export const metadata: Metadata = { title: "Auto-responses · Inbox" };
export const dynamic = "force-dynamic";

export default async function AutoResponsesPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Auto-responses" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const rules = await listAutoResponseRules();

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Inbox", href: "/development-os/inbox" },
          { label: "Auto-responses" },
        ]}
        eyebrow={`${rules.length} rule${rules.length === 1 ? "" : "s"}`}
        title="Auto-response rules"
        description="Triggered automations for inbound messages. Keyword + first_message + after_hours fire inline as messages arrive; no_response_timeout + after_hours boundary fire from the messaging_auto_response_evaluator cron (every minute)."
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
        title="Create rule"
        description='trigger_config + action_config are JSON. Examples: keyword -> {"keywords":["price","booking"],"matchType":"any"}; after_hours -> {"timezone":"Asia/Jakarta","startHour":18,"endHour":9}; no_response_timeout -> {"thresholdMinutes":120}.'
      >
        <form
          action={createAutoResponseRuleAction}
          className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border border-line-soft bg-surface p-3 text-sm"
          data-testid="messaging-rule-create-form"
        >
          <Field label="Name">
            <input
              type="text"
              name="name"
              required
              placeholder="Welcome new inquiries"
              className={inputCls}
            />
          </Field>
          <Field label="Description">
            <input type="text" name="description" className={inputCls} />
          </Field>
          <Field label="Channels (comma-separated)">
            <input
              type="text"
              name="channels"
              required
              placeholder="whatsapp,instagram"
              className={inputCls}
            />
          </Field>
          <Field label="Trigger type">
            <select name="triggerType" required className={inputCls}>
              <option value="keyword">keyword</option>
              <option value="first_message">first_message</option>
              <option value="after_hours">after_hours</option>
              <option value="no_response_timeout">no_response_timeout</option>
            </select>
          </Field>
          <Field label="Trigger config (JSON)" className="md:col-span-2">
            <textarea
              name="triggerConfig"
              required
              rows={3}
              placeholder='{"keywords":["price","booking"],"matchType":"any"}'
              className={inputCls + " font-mono"}
            />
          </Field>
          <Field label="Action type">
            <select name="actionType" required className={inputCls}>
              <option value="send_template">send_template</option>
              <option value="send_text">send_text</option>
              <option value="assign_to_user">assign_to_user</option>
              <option value="add_tag">add_tag</option>
            </select>
          </Field>
          <Field label="Action config (JSON)">
            <textarea
              name="actionConfig"
              required
              rows={3}
              placeholder='{"templateCode":"welcome_inquiry"}'
              className={inputCls + " font-mono"}
            />
          </Field>
          <Field label="Throttle window (minutes)">
            <input
              type="number"
              name="throttleWindowMinutes"
              defaultValue={60}
              min={0}
              className={inputCls}
            />
          </Field>
          <Field label="Priority (lower = higher precedence)">
            <input
              type="number"
              name="priority"
              defaultValue={100}
              className={inputCls}
            />
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" variant="primary">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              Create rule
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Existing rules">
        {rules.length === 0 ? (
          <EmptyState
            title="No rules configured"
            description="Create your first rule above."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Trigger</TH>
                <TH>Action</TH>
                <TH>Channels</TH>
                <TH className="text-right">Priority</TH>
                <TH className="text-right">Triggered</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rules.map((r) => {
                const toggleBound = setRuleActiveAction.bind(
                  null,
                  r.id,
                  !r.isActive,
                );
                return (
                  <TR key={r.id}>
                    <TD>{r.name}</TD>
                    <TD className="text-xs font-mono">{r.triggerType}</TD>
                    <TD className="text-xs font-mono">{r.actionType}</TD>
                    <TD className="text-xs">
                      {(r.channels as string[]).join(", ")}
                    </TD>
                    <TD className="text-right tabular-nums">{r.priority}</TD>
                    <TD className="text-right tabular-nums">
                      {r.triggerCount}
                    </TD>
                    <TD>
                      <Badge tone={r.isActive ? "success" : "neutral"}>
                        {r.isActive ? "active" : "paused"}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <form action={toggleBound}>
                        <Button type="submit" variant="secondary" size="sm">
                          {r.isActive ? "Pause" : "Activate"}
                        </Button>
                      </form>
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
