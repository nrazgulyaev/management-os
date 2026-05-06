"use client";

import * as React from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import {
  ACTIVE_CHANNELS,
  CHANNELS,
  CHANNEL_LABEL,
  RECIPIENT_TYPES,
  RECIPIENT_TYPE_LABEL,
  TRIGGER_EVENTS,
  TRIGGER_EVENT_LABEL,
} from "@/lib/development/constants/notification-constants";
import type {
  NotificationDeliveryRecord,
  NotificationRuleData,
  NotificationTemplateData,
} from "@/lib/development/types/notifications";
import {
  createNotificationRule,
  updateNotificationRule,
} from "@/lib/development/server/notification-actions";

interface Props {
  rules: NotificationRuleData[];
  templates: NotificationTemplateData[];
  deliveryLog: NotificationDeliveryRecord[];
}

const statusTone: Record<
  string,
  "neutral" | "accent" | "gold" | "danger" | "success"
> = {
  queued: "gold",
  sent: "accent",
  delivered: "success",
  bounced: "danger",
  failed: "danger",
};

export function NotificationRulesTabs({
  rules,
  templates,
  deliveryLog,
}: Props) {
  const [drawerRule, setDrawerRule] = React.useState<
    NotificationRuleData | "new" | null
  >(null);

  return (
    <>
      <Tabs.Root defaultValue="rules">
        <Tabs.List
          className="flex items-center gap-1 border-b border-line-soft mb-6"
          aria-label="Notification settings"
        >
          <TabTrigger value="rules" label="Rules" badge={rules.length} />
          <TabTrigger
            value="templates"
            label="Templates"
            badge={templates.length}
          />
          <TabTrigger
            value="delivery"
            label="Delivery log"
            badge={deliveryLog.length}
          />
          <TabTrigger value="test" label="Test send" />
        </Tabs.List>

        <Tabs.Content value="rules" className="focus:outline-none">
          <RulesTab
            rules={rules}
            templates={templates}
            onEdit={setDrawerRule}
            onCreate={() => setDrawerRule("new")}
          />
        </Tabs.Content>
        <Tabs.Content value="templates" className="focus:outline-none">
          <TemplatesTab templates={templates} />
        </Tabs.Content>
        <Tabs.Content value="delivery" className="focus:outline-none">
          <DeliveryTab deliveryLog={deliveryLog} />
        </Tabs.Content>
        <Tabs.Content value="test" className="focus:outline-none">
          <TestSendTab rules={rules} />
        </Tabs.Content>
      </Tabs.Root>

      {drawerRule && (
        <RuleDrawer
          rule={drawerRule === "new" ? null : drawerRule}
          templates={templates}
          onClose={() => setDrawerRule(null)}
        />
      )}
    </>
  );
}

function TabTrigger({
  value,
  label,
  badge,
}: {
  value: string;
  label: string;
  badge?: number;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className={cn(
        "relative inline-flex items-center gap-2 h-10 px-3 text-sm text-ink-secondary hover:text-ink",
        "data-[state=active]:text-ink",
        "after:absolute after:left-3 after:right-3 after:-bottom-[1px] after:h-px after:bg-transparent",
        "data-[state=active]:after:bg-ink",
        "transition-colors",
      )}
    >
      {label}
      {badge !== undefined && (
        <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-muted text-ink-tertiary">
          {badge}
        </span>
      )}
    </Tabs.Trigger>
  );
}

function RulesTab({
  rules,
  onEdit,
  onCreate,
}: {
  rules: NotificationRuleData[];
  templates: NotificationTemplateData[];
  onEdit: (rule: NotificationRuleData) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">
          Active rules drive the notification dispatch cron. WhatsApp / SMS
          rows are persisted but not delivered until Stage 3.
        </p>
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          New rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-soft bg-muted/30 px-6 py-10 text-center">
          <p className="text-sm text-ink-secondary">
            No notification rules yet. Click "+ New rule" to create one.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 border-b border-line-soft">
              <tr className="text-left">
                <Th>Name</Th>
                <Th>Trigger</Th>
                <Th>Recipient</Th>
                <Th>Channel</Th>
                <Th>Template</Th>
                <Th>Active</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-line-soft last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-ink">{r.ruleName}</span>
                      {r.description && (
                        <span className="text-[11px] text-ink-tertiary">
                          {r.description}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">
                    {TRIGGER_EVENT_LABEL[r.triggerEvent] ?? r.triggerEvent}
                    {r.triggerOffsetDays !== 0 && (
                      <span className="text-[11px] text-ink-tertiary">
                        {" "}
                        · {r.triggerOffsetDays > 0 ? "+" : ""}
                        {r.triggerOffsetDays}d
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">
                    {RECIPIENT_TYPE_LABEL[r.recipientType] ?? r.recipientType}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        ACTIVE_CHANNELS.includes(r.channel) ? "accent" : "gold"
                      }
                    >
                      {CHANNEL_LABEL[r.channel] ?? r.channel}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-tertiary">
                    {r.templateName}
                  </td>
                  <td className="px-4 py-3">
                    {r.isActive ? (
                      <Badge tone="success">on</Badge>
                    ) : (
                      <Badge tone="neutral">off</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(r)}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TemplatesTab({ templates }: { templates: NotificationTemplateData[] }) {
  if (templates.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-soft bg-muted/30 px-6 py-10 text-center">
        <p className="text-sm text-ink-secondary">
          No templates yet. The base seed (notification_templates) ships
          two: <code className="font-mono text-xs">milestone_due_reminder</code>{" "}
          and <code className="font-mono text-xs">reservation_expiring</code>.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {templates.map((t) => (
        <li
          key={t.id}
          className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-ink">
                {t.templateName}
              </span>
              {t.description && (
                <span className="text-xs text-ink-tertiary">
                  {t.description}
                </span>
              )}
            </div>
            <Badge tone="outline">{t.language}</Badge>
          </div>
          <div className="rounded-sm bg-canvas border border-line-soft px-3 py-2">
            <span className="text-label">Subject</span>
            <p className="text-sm text-ink mt-1">{t.subject}</p>
          </div>
          <div className="rounded-sm bg-canvas border border-line-soft px-3 py-2">
            <span className="text-label">Body (text)</span>
            <pre className="text-xs text-ink-secondary leading-relaxed whitespace-pre-wrap font-mono mt-1">
              {t.bodyText}
            </pre>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeliveryTab({
  deliveryLog,
}: {
  deliveryLog: NotificationDeliveryRecord[];
}) {
  if (deliveryLog.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-soft bg-muted/30 px-6 py-10 text-center">
        <p className="text-sm text-ink-secondary">
          No deliveries logged yet. Once the cron worker runs, dispatched
          messages appear here.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 border-b border-line-soft">
          <tr className="text-left">
            <Th>Time</Th>
            <Th>Channel</Th>
            <Th>Recipient</Th>
            <Th>Subject</Th>
            <Th>Status</Th>
            <Th>Error</Th>
          </tr>
        </thead>
        <tbody>
          {deliveryLog.map((d) => (
            <tr
              key={d.id}
              className="border-b border-line-soft last:border-b-0 hover:bg-muted/30"
            >
              <td className="px-4 py-2.5 font-mono text-xs text-ink-tertiary whitespace-nowrap">
                {formatDate(d.createdAt, "short")}
              </td>
              <td className="px-4 py-2.5">
                <Badge tone={ACTIVE_CHANNELS.includes(d.channel) ? "accent" : "gold"}>
                  {d.channel}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-ink-secondary truncate max-w-[180px]">
                {d.recipientAddress ?? "—"}
              </td>
              <td className="px-4 py-2.5 text-ink truncate max-w-[280px]">
                {d.subject}
              </td>
              <td className="px-4 py-2.5">
                <Badge tone={statusTone[d.status] ?? "neutral"}>
                  {d.status}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-[11px] text-ink-tertiary truncate max-w-[200px]">
                {d.errorReason ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TestSendTab({ rules }: { rules: NotificationRuleData[] }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-6 flex flex-col gap-3 max-w-2xl">
      <p className="text-sm text-ink-secondary">
        Test send is a Checkpoint 3 polish. The dispatch loop already
        respects <code className="font-mono text-xs">EMAIL_DRY_RUN=1</code>
        — when set, every rule run logs to{" "}
        <code className="font-mono text-xs">dev_notification_delivery_log</code>{" "}
        without external send. To dry-run today: set
        <code className="font-mono text-xs"> EMAIL_DRY_RUN=1</code> and call
        the cron HTTP route, then inspect the delivery log tab.
      </p>
      <div className="flex items-center gap-2 text-xs text-ink-tertiary">
        <span>{rules.length} rules visible</span>
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">
      {children}
    </th>
  );
}

function RuleDrawer({
  rule,
  templates,
  onClose,
}: {
  rule: NotificationRuleData | null;
  templates: NotificationTemplateData[];
  onClose: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const action = rule ? updateNotificationRule : createNotificationRule;
      if (rule) formData.append("id", rule.id);
      const res = await action(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="absolute right-0 top-0 h-full w-full max-w-md bg-canvas border-l border-line-soft shadow-[var(--shadow-floating)] flex flex-col"
      >
        <header className="px-6 h-16 border-b border-line-soft flex items-center justify-between">
          <h2 className="text-display text-[20px] font-medium text-ink">
            {rule ? "Edit rule" : "New rule"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-tertiary hover:text-ink"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </header>
        <form
          action={submit}
          className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4"
        >
          <Field name="ruleName" label="Rule name" required defaultValue={rule?.ruleName} />
          <Field name="description" label="Description" defaultValue={rule?.description ?? ""} />

          <Select
            name="triggerEvent"
            label="Trigger event"
            defaultValue={rule?.triggerEvent ?? TRIGGER_EVENTS[0]}
            options={TRIGGER_EVENTS.map((t) => ({
              value: t,
              label: TRIGGER_EVENT_LABEL[t] ?? t,
            }))}
          />

          <Field
            name="triggerOffsetDays"
            label="Trigger offset (days)"
            type="number"
            defaultValue={String(rule?.triggerOffsetDays ?? 0)}
          />

          <Select
            name="recipientType"
            label="Recipient type"
            defaultValue={rule?.recipientType ?? "buyer"}
            options={RECIPIENT_TYPES.map((r) => ({
              value: r,
              label: RECIPIENT_TYPE_LABEL[r] ?? r,
            }))}
          />

          <Field
            name="recipientRoleKey"
            label="Recipient role key (if specific_role)"
            defaultValue={rule?.recipientRoleKey ?? ""}
          />

          <Select
            name="channel"
            label="Channel"
            defaultValue={rule?.channel ?? "email"}
            options={CHANNELS.map((c) => ({
              value: c,
              label: ACTIVE_CHANNELS.includes(c)
                ? CHANNEL_LABEL[c] ?? c
                : `${CHANNEL_LABEL[c] ?? c} (Stage 3)`,
              disabled: !ACTIVE_CHANNELS.includes(c),
            }))}
          />

          <Select
            name="templateName"
            label="Template"
            defaultValue={rule?.templateName ?? templates[0]?.templateName ?? ""}
            options={templates.map((t) => ({
              value: t.templateName,
              label: `${t.templateName} (${t.language})`,
            }))}
          />

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="isActive"
              value="true"
              defaultChecked={rule?.isActive ?? true}
            />
            Active
          </label>

          {error && (
            <div className="rounded-sm border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink">
              {error}
            </div>
          )}
        </form>
        <footer className="px-6 py-4 border-t border-line-soft flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={(e) => {
              const form = e.currentTarget.closest("aside")?.querySelector("form");
              if (form) {
                e.preventDefault();
                form.requestSubmit();
              }
            }}
            disabled={pending}
          >
            {pending ? "Saving…" : rule ? "Save changes" : "Create rule"}
          </Button>
        </footer>
      </aside>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="h-10 rounded-sm border border-line-soft bg-surface px-3 text-sm text-ink focus:outline-none focus:border-line-strong"
      />
    </div>
  );
}

function Select({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-label">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="h-10 rounded-sm border border-line-soft bg-surface px-3 text-sm text-ink focus:outline-none focus:border-line-strong"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
