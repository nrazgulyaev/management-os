import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import {
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  getAgentForCurrentUser,
  listUserThreads,
  loadThreadMessages,
  deleteThreadAction,
} from "@/lib/agents/thread-actions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { AgentChat } from "./agent-chat";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ agentCode: string }>;
}) {
  const { agentCode } = await params;
  const agent = await getAgentForCurrentUser(agentCode);
  return {
    title: agent ? `${agent.displayName} · AI agents` : "AI agent",
  };
}

export default async function AgentChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ agentCode: string }>;
  searchParams: Promise<{ thread?: string }>;
}) {
  const { agentCode } = await params;
  const { thread: incomingThreadId } = await searchParams;

  const me = await getCurrentAppUser();
  if (!me) {
    redirect(`/login?next=/development-os/agents/${agentCode}`);
  }

  const agent = await getAgentForCurrentUser(agentCode);

  if (!agent) {
    return (
      <DevelopmentShell>
        <div className="mx-auto max-w-2xl px-6 py-12">
          <SectionHeading
            eyebrow="AI agents"
            title="Agent not found"
            subtitle="This agent either doesn't exist or your organization isn't subscribed to it."
          />
          <Card style={{ padding: 32, textAlign: "center", marginTop: 24 }}>
            <p className="text-sm text-ink-tertiary mb-4">
              Contact your administrator if you believe this is an error.
            </p>
            <Link
              href="/development-os"
              className="inline-flex rounded-md border border-line-soft px-4 py-2 text-sm text-ink hover:border-line-strong"
            >
              Return to Development OS
            </Link>
          </Card>
        </div>
      </DevelopmentShell>
    );
  }

  if (!agent.subscriptionEnabled) {
    return (
      <DevelopmentShell>
        <div className="mx-auto max-w-2xl px-6 py-12">
          <SectionHeading
            eyebrow="AI agents"
            title={agent.displayName}
            subtitle="Your organization is not currently subscribed to this agent."
          />
          <Card style={{ padding: 32, textAlign: "center", marginTop: 24 }}>
            <p className="text-sm text-ink-tertiary">
              Contact your administrator to enable this agent.
            </p>
          </Card>
        </div>
      </DevelopmentShell>
    );
  }

  const threads = await listUserThreads(agent.id);
  const activeThreadId = incomingThreadId ?? null;
  const initialMessages = activeThreadId
    ? await loadThreadMessages(activeThreadId)
    : [];

  return (
    <DevelopmentShell>
      <div className="mx-auto max-w-6xl w-full px-6 py-8 flex flex-col gap-6">
        <SectionHeading
          eyebrow="AI agents"
          title={agent.displayName}
          subtitle={agent.description ?? `${agent.provider} · ${agent.model}`}
          actions={
            <div className="flex items-center gap-2">
              <Badge tone={agent.hasApiKey ? "ok" : "warn"}>
                {agent.hasApiKey ? "Ready" : "Not configured"}
              </Badge>
            </div>
          }
        />

        {!agent.hasApiKey && (
          <div
            role="alert"
            className="rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-ink-secondary"
          >
            This agent does not have an API key configured. Asking a
            question will fail until the platform administrator sets one.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
          <aside className="flex flex-col gap-2">
            <Link
              href={`/development-os/agents/${agentCode}`}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm text-ink-inverse hover:bg-ink/90"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              New conversation
            </Link>

            <Card style={{ padding: 0, marginTop: 8 }}>
              {threads.length === 0 ? (
                <div className="px-4 py-6 text-xs text-ink-tertiary text-center">
                  No conversations yet.
                </div>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {threads.map((t) => (
                    <ThreadRow
                      key={t.id}
                      agentCode={agentCode}
                      thread={t}
                      isActive={t.id === activeThreadId}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </aside>

          <main>
            <AgentChat
              agentId={agent.id}
              agentCode={agentCode}
              agentDisplayName={agent.displayName}
              threadId={activeThreadId}
              initialMessages={initialMessages}
            />
          </main>
        </div>
      </div>
    </DevelopmentShell>
  );
}

function ThreadRow({
  agentCode,
  thread,
  isActive,
}: {
  agentCode: string;
  thread: {
    id: string;
    title: string | null;
    updatedAt: string;
    lastMessagePreview: string | null;
  };
  isActive: boolean;
}) {
  const label = thread.title?.trim() || thread.lastMessagePreview?.slice(0, 40) || "Untitled";
  return (
    <li className={`group ${isActive ? "bg-muted/40" : ""}`}>
      <div className="flex items-start gap-2 px-3 py-2">
        <Link
          href={`/development-os/agents/${agentCode}?thread=${thread.id}`}
          className="flex-1 min-w-0"
        >
          <div className="flex items-center gap-2">
            <MessageSquare
              className="w-3.5 h-3.5 text-ink-tertiary shrink-0"
              strokeWidth={1.75}
            />
            <span className="text-sm text-ink truncate">{label}</span>
          </div>
          <p className="text-[11px] text-ink-tertiary mt-0.5 ml-5">
            {thread.updatedAt.slice(0, 10)}
          </p>
        </Link>
        <form action={deleteThreadAction} className="opacity-0 group-hover:opacity-100 transition-opacity">
          <input type="hidden" name="threadId" value={thread.id} />
          <input type="hidden" name="agentCode" value={agentCode} />
          <button
            type="submit"
            title="Delete conversation"
            className="p-1 rounded-sm hover:bg-danger/10 text-ink-tertiary hover:text-danger"
          >
            <Trash2 className="w-3 h-3" strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </li>
  );
}
