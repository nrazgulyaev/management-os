import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
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
        <div className="page-header">
          <div className="left">
            <h1>Auto-responses</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/inbox">Inbox</Link> /{" "}
            <span>Auto-responses</span>
          </div>
          <h1>Auto-response rules</h1>
          <div className="page-header-meta">
            <span>
              {rules.length} rule{rules.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Triggered automations for inbound messages. Keyword + first_message +
            after_hours fire inline as messages arrive; no_response_timeout +
            after_hours boundary fire from the messaging_auto_response_evaluator
            cron (every minute).
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
        <div className="label mb-2.5">Create rule</div>
        <p className="text-[13px] text-ink-3 mt-0 mb-2.5 max-w-[680px]">
          {
            'trigger_config + action_config are JSON. Examples: keyword -> {"keywords":["price","booking"],"matchType":"any"}; after_hours -> {"timezone":"Asia/Jakarta","startHour":18,"endHour":9}; no_response_timeout -> {"thresholdMinutes":120}.'
          }
        </p>
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
            <button type="submit" className="btn btn-accent">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              Create rule
            </button>
          </div>
        </form>
      </div>

      <div>
        <div className="label mb-2.5">Existing rules</div>
        {rules.length === 0 ? (
          <EmptyState
            title="No rules configured"
            description="Create your first rule above."
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Trigger</th>
                  <th scope="col">Action</th>
                  <th scope="col">Channels</th>
                  <th scope="col" className="num">Priority</th>
                  <th scope="col" className="num">Triggered</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => {
                  const toggleBound = setRuleActiveAction.bind(
                    null,
                    r.id,
                    !r.isActive,
                  );
                  return (
                    <tr key={r.id}>
                      <td className="row-title">{r.name}</td>
                      <td className="text-xs font-mono">{r.triggerType}</td>
                      <td className="text-xs font-mono">{r.actionType}</td>
                      <td className="text-xs">
                        {(r.channels as string[]).join(", ")}
                      </td>
                      <td className="num">{r.priority}</td>
                      <td className="num">{r.triggerCount}</td>
                      <td>
                        <HandoffBadge tone={r.isActive ? "ok" : "soft"}>
                          {r.isActive ? "active" : "paused"}
                        </HandoffBadge>
                      </td>
                      <td className="text-right">
                        <form action={toggleBound}>
                          <button
                            type="submit"
                            className="btn btn-secondary btn-sm"
                          >
                            {r.isActive ? "Pause" : "Activate"}
                          </button>
                        </form>
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
