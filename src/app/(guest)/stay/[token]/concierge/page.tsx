import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { GuestShell } from "@/components/layout/guest-shell";
import { Badge } from "@/components/ui/badge";
import { getStayByToken } from "@/features/guest-stays/services";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { hashStayToken } from "@/features/guest-stays/token";
import { rateLimitStayTokenAccess } from "@/features/guest-stays/rate-limit";
import { RateLimitedView } from "@/components/stay/rate-limited";
import {
  ensureActiveSession,
  listMessagesForSession,
  userMessageCount,
} from "@/features/guest-ai-concierge/services";
import {
  ConciergeChat,
  type ChatMessage,
} from "@/components/stay/concierge-chat";
import { isAiConfigured, isAiDryRun } from "@/lib/env";

export const metadata = { title: "Concierge AI" };
export const dynamic = "force-dynamic";

const MAX_USER_MESSAGES = 12;
const SUGGESTED_PROMPTS = [
  "What's the check-in process?",
  "Where can we have dinner nearby?",
  "What are the house rules?",
  "Suggest a relaxing day plan.",
  "Which services do you offer?",
];

export default async function ConciergePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const tokenPrefix = token.slice(0, 8);

  const rl = await rateLimitStayTokenAccess({ tokenPrefix, ip });
  if (!rl.allowed) {
    return <RateLimitedView blockedUntil={rl.blockedUntil.toISOString()} />;
  }

  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) redirect(`/stay/${token}/verify`);

  const resolved = await getStayByToken(token);
  if (!resolved.ok) notFound();
  const stay = resolved.stay;

  const sessionId = await ensureActiveSession({
    guestStayTokenId: stay.tokenId,
    bookingId: stay.bookingId,
  });
  const initialMessages: ChatMessage[] = sessionId
    ? (await listMessagesForSession(sessionId, 60))
        .filter((m) => m.role !== "system")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          safetyStatus:
            (m.safetyStatus as "ok" | "refused" | "redacted" | "error") ?? "ok",
          citations: (m.citationsJson as ChatMessage["citations"]) ?? undefined,
          model: m.model,
        }))
    : [];
  const userMsgs = sessionId ? await userMessageCount(sessionId) : 0;
  const remaining = Math.max(0, MAX_USER_MESSAGES - userMsgs);

  const villaLabel = stay.villaName ?? stay.villaCode ?? "your villa";
  const dateRange = `${stay.checkIn} → ${stay.checkOut}`;
  const offline = !isAiConfigured() || isAiDryRun();

  return (
    <GuestShell villaName={villaLabel} dates={dateRange}>
      <div className="flex flex-col gap-6">
        <Link
          href={`/stay/${token}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Stay home
        </Link>

        <header className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-ink-tertiary">
            <Sparkles className="w-3.5 h-3.5" /> Concierge AI
          </span>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            Ask the {villaLabel} concierge
          </h1>
          {offline && (
            <Badge tone="warning">
              Offline mode · using configured villa info only
            </Badge>
          )}
        </header>

        <ConciergeChat
          token={token}
          initialMessages={initialMessages}
          villaName={villaLabel}
          remainingMessages={remaining}
          suggestedPrompts={SUGGESTED_PROMPTS}
        />

        <div className="rounded-xl border border-line-soft bg-canvas/40 p-4 grid grid-cols-2 gap-3">
          <Link
            href={`/stay/${token}/services`}
            className="text-sm rounded-md border border-line-soft bg-surface p-3 hover:border-line-strong"
          >
            <div className="text-ink font-medium">Concierge & services</div>
            <div className="text-[11px] text-ink-tertiary mt-1">
              Book a real service through staff
            </div>
          </Link>
          <Link
            href={`/stay/${token}/emergency`}
            className="text-sm rounded-md border border-line-soft bg-surface p-3 hover:border-line-strong"
          >
            <div className="text-ink font-medium">Emergency</div>
            <div className="text-[11px] text-ink-tertiary mt-1">
              Safety contacts and urgent help
            </div>
          </Link>
        </div>
      </div>
    </GuestShell>
  );
}
