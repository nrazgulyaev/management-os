import { notFound } from "next/navigation";
import Link from "next/link";
import { GuestShell } from "@/components/layout/guest-shell";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { GuestMessageComposer } from "@/components/direct-booking/guest-message-composer";
import {
  resolveGuestChainByToken,
  rebuildGuestStatusSnapshotForHold,
  getGuestStatusSnapshotByHoldToken,
} from "@/features/direct-booking/guest-status-services";
import { listGuestMessagesByHoldToken, markGuestThreadReadForToken } from "@/features/direct-booking/guest-messages";
import {
  type PublicGuestStage,
  isTerminalStage,
} from "@/features/direct-booking/guest-status-pure";

export const metadata = { title: "Concierge messages" };
export const dynamic = "force-dynamic";

export default async function GuestMessagesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const chain = await resolveGuestChainByToken(token);
  if (!chain) notFound();
  try {
    await rebuildGuestStatusSnapshotForHold(chain.hold.id, token);
  } catch (err) {
    console.error("[guest-messages] rebuild failed", err);
  }
  const [snapshot, messages] = await Promise.all([
    getGuestStatusSnapshotByHoldToken(token),
    listGuestMessagesByHoldToken(token),
  ]);
  if (!snapshot) notFound();
  // Mark guest as read on view.
  try {
    await markGuestThreadReadForToken(token);
  } catch (err) {
    console.error("[guest-messages] mark read failed", err);
  }
  const stage = snapshot.publicStage as PublicGuestStage;
  const disabled = isTerminalStage(stage) || stage === "failed";
  return (
    <GuestShell
      villaName={snapshot.villaLabel ?? "Villa"}
      dates={`${snapshot.checkIn ?? ""} → ${snapshot.checkOut ?? ""}`}
    >
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Link
            href={`/book/hold/${token}/status`}
            className="text-xs text-ink-tertiary hover:text-ink"
          >
            ← Back to booking status
          </Link>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            Concierge messages
          </h1>
          <p className="text-sm text-ink-secondary max-w-prose">
            A simple thread between you and our concierge team. Please
            don&apos;t share payment details, passwords, or access codes.
          </p>
        </header>
        <Section eyebrow="Conversation" title={`${messages.length} message${messages.length === 1 ? "" : "s"}`}>
          {messages.length === 0 ? (
            <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
              No messages yet. Use the form below to start the conversation.
            </p>
          ) : (
            <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className="px-4 py-3 flex flex-col gap-1"
                >
                  <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
                    <Badge tone={m.authorType === "staff" ? "accent" : "neutral"}>
                      {m.authorType === "staff"
                        ? "Concierge"
                        : m.authorType === "system"
                          ? "System"
                          : "You"}
                    </Badge>
                    <span>
                      {m.createdAt instanceof Date
                        ? m.createdAt.toISOString().slice(0, 16).replace("T", " ")
                        : (m.createdAt as unknown as string)}
                    </span>
                  </div>
                  <p className="text-sm text-ink leading-relaxed">
                    {m.bodyRedacted}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section eyebrow="Reply" title="Send a message">
          <GuestMessageComposer
            token={token}
            disabled={disabled}
            disabledReason={
              disabled
                ? "Messaging is disabled for this booking request."
                : null
            }
          />
        </Section>
      </div>
    </GuestShell>
  );
}
