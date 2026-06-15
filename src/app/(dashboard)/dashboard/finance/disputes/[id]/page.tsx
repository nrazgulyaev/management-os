import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { getDisputeThread } from "@/features/finance/dispute-queries";
import { DisputeReplyForm } from "@/components/finance/dispute-reply-form";
import { resolveDisputeAndReissue } from "@/features/finance/statement-actions";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Dispute" };
export const dynamic = "force-dynamic";

function actorName(actorKind: string, ownerName: string): string {
  if (actorKind === "owner") return ownerName;
  if (actorKind === "mgmt_staff") return "Mgmt team";
  if (actorKind === "concierge_agent") return "Concierge";
  return "System";
}

export default async function DisputeThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getDisputeThread(id);
  if (!t) notFound();

  const resolved = t.ownerState === "superseded" || t.threadStatus !== "open";

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/disputes">Owner disputes</Link> /{" "}
            <span>{t.statementCode}</span>
          </div>
          <h1>Dispute · {t.statementCode}</h1>
          <p className="text-[13px] text-ink-3 mt-2">
            {t.ownerName} · {t.periodLabel}
            {t.villaCode ? ` · ${t.villaCode}` : ""}
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/dashboard/finance/statements/${t.statementId}`}
            className="btn btn-secondary btn-sm"
          >
            Open statement
          </Link>
        </div>
      </div>

      {/* Summary */}
      <Card padding="default">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Owner" value={t.ownerName} />
          <Field label="Period" value={t.periodLabel} />
          <Field label="Net payout" value={formatMoneyMinor(t.netPayoutMinor, t.currency)} />
          <Field label="Reason" value={t.reasonLabel} />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <HandoffBadge tone={resolved ? "soft" : "gold"}>{t.threadStatus}</HandoffBadge>
          <span className="text-xs text-ink-tertiary">
            Owner-state: {t.ownerState}
            {!resolved && " · payout paused"}
          </span>
        </div>
      </Card>

      {/* Conversation */}
      <Card padding="default">
        <h3 className="text-sm font-medium text-ink mb-3">Conversation</h3>
        <div className="flex flex-col gap-3">
          {t.messages.length === 0 ? (
            <p className="text-sm text-ink-tertiary italic">No messages yet.</p>
          ) : (
            t.messages.map((m) => {
              const mine = m.actorKind === "mgmt_staff";
              return (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    mine
                      ? "self-end bg-accent-weak/60 text-ink"
                      : "self-start bg-muted text-ink"
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-1">
                    {actorName(m.actorKind, t.ownerName)} ·{" "}
                    {new Date(m.sentAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.body}</div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Reply + Resolve */}
      {resolved ? (
        <Card padding="default">
          <p className="text-sm text-ink-secondary m-0">
            This dispute is resolved. A revised statement was issued; the owner re-enters at
            “pending” on the new statement.
          </p>
        </Card>
      ) : (
        <>
          <Card padding="default">
            <h3 className="text-sm font-medium text-ink mb-3">Reply</h3>
            <DisputeReplyForm threadId={t.threadId} />
          </Card>

          <Card padding="default">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-medium text-ink m-0">Resolve & reissue</h3>
                <p className="text-xs text-ink-tertiary mt-1 max-w-md">
                  Creates a corrected draft statement (copying this one’s lines), marks this one
                  superseded, and resolves the thread. The owner re-enters at “pending” once the
                  revised statement is sent.
                </p>
              </div>
              <form
                action={async () => {
                  "use server";
                  const res = await resolveDisputeAndReissue(t.statementId);
                  if (res.ok && res.newStatementId) {
                    redirect(`/dashboard/finance/statements/${res.newStatementId}`);
                  }
                }}
              >
                <button type="submit" className="btn btn-accent btn-sm">
                  Resolve & reissue
                </button>
              </form>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary mb-1">{label}</div>
      <div className="text-sm text-ink">{value}</div>
    </div>
  );
}
