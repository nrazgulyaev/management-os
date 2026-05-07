import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
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
import { listThreads } from "@/lib/messaging/queries";
import {
  MESSAGING_CHANNELS,
  THREAD_STATUSES,
  type MessagingChannel,
  type ThreadStatus,
} from "@/lib/db/schema/messaging";

export const metadata: Metadata = { title: "Inbox · Development OS" };
export const dynamic = "force-dynamic";

const CHANNEL_LABELS: Record<MessagingChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  facebook_messenger: "Messenger",
  email: "Email",
  sms: "SMS",
  internal_note: "Internal note",
};

export default async function MessagingInboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    channel?: string;
    status?: string;
    unread?: string;
    q?: string;
  }>;
}) {
  const sp = await searchParams;
  const channel = (MESSAGING_CHANNELS as readonly string[]).includes(
    sp.channel ?? "",
  )
    ? (sp.channel as MessagingChannel)
    : undefined;
  const status = (THREAD_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as ThreadStatus)
    : undefined;
  const unreadOnly = sp.unread === "1";
  const search = (sp.q ?? "").trim() || undefined;

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Inbox" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }

  const threads = await listThreads({
    channel,
    status,
    unreadOnly,
    search,
    limit: 200,
  });
  const unreadTotal = threads.reduce((acc, t) => acc + t.unreadCount, 0);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Inbox" },
        ]}
        eyebrow={`${threads.length} thread${threads.length === 1 ? "" : "s"}${unreadTotal > 0 ? ` · ${unreadTotal} unread` : ""}`}
        title="Unified inbox"
        description="Every conversation across WhatsApp, Telegram, Instagram, Messenger, Email, and SMS in one view. Each row links to the full thread; templates and auto-response rules are managed from the side actions."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/inbox/templates">
                <FileText className="w-4 h-4" strokeWidth={1.75} />
                Templates
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/inbox/auto-responses">
                <Zap className="w-4 h-4" strokeWidth={1.75} />
                Auto-responses
              </Link>
            </Button>
          </div>
        }
      />

      <form
        method="GET"
        action="/development-os/inbox"
        className="rounded-md border border-line-soft bg-surface p-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm"
        data-testid="messaging-inbox-filter-form"
      >
        <FilterField label="Channel">
          <select
            name="channel"
            defaultValue={sp.channel ?? ""}
            className={inputCls}
          >
            <option value="">All channels</option>
            {MESSAGING_CHANNELS.filter((c) => c !== "internal_note").map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className={inputCls}
          >
            <option value="">All</option>
            {THREAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Unread only">
          <select
            name="unread"
            defaultValue={sp.unread ?? ""}
            className={inputCls}
          >
            <option value="">No</option>
            <option value="1">Yes</option>
          </select>
        </FilterField>
        <FilterField label="Search subject">
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Subject contains…"
            className={inputCls}
          />
        </FilterField>
        <div className="md:col-span-4 flex justify-end gap-2">
          <Button type="submit" variant="primary" size="sm">
            Apply filters
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/development-os/inbox">Reset</Link>
          </Button>
        </div>
      </form>

      {threads.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Once a webhook delivers an inbound message, threads will appear here."
          action={
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Back to Development OS
              </Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Subject</TH>
              <TH>Channel</TH>
              <TH>Status</TH>
              <TH className="text-right">Messages</TH>
              <TH className="text-right">Unread</TH>
              <TH>Last activity</TH>
            </TR>
          </THead>
          <TBody>
            {threads.map((t) => (
              <TR key={t.id}>
                <TD>
                  <Link
                    href={`/development-os/inbox/${t.id}`}
                    className="text-ink-strong hover:underline"
                  >
                    {t.subject ?? "(no subject)"}
                  </Link>
                </TD>
                <TD>
                  {t.primaryChannel ? (
                    <Badge tone="outline">
                      {CHANNEL_LABELS[t.primaryChannel as MessagingChannel] ??
                        t.primaryChannel}
                    </Badge>
                  ) : (
                    <span className="text-ink-secondary">—</span>
                  )}
                </TD>
                <TD>
                  <Badge
                    tone={t.status === "active" ? "accent" : "neutral"}
                  >
                    {t.status}
                  </Badge>
                </TD>
                <TD className="text-right tabular-nums">{t.totalMessages}</TD>
                <TD className="text-right tabular-nums">
                  {t.unreadCount > 0 ? (
                    <Badge tone="warning">{t.unreadCount}</Badge>
                  ) : (
                    <span className="text-ink-secondary">0</span>
                  )}
                </TD>
                <TD className="text-ink-secondary">
                  {t.lastMessageAt
                    ? new Date(t.lastMessageAt).toISOString().slice(0, 16).replace("T", " ")
                    : "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </DevelopmentShell>
  );
}

const inputCls =
  "w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-ink-secondary text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}
