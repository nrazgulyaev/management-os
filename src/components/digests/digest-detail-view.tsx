import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SectionHeading, Card, Badge } from "@/components/dashboard/primitives";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { markDigestAsReadAction } from "@/features/digests/actions";
import type { DigestRow } from "@/features/digests/queries";

/**
 * DAILY-DIGEST-SPRINT-1 P4.3 — shared digest detail view.
 *
 * Renders the full markdown body, type badge, created timestamp,
 * back link, and a "Mark as read" form when the digest is unread.
 * Super_admin sees a "View source run" link to the agent_runs
 * telemetry surface.
 *
 * "Auto-mark on mount" is deliberately NOT done here — that would
 * require a client island just to fire the action, and the explicit
 * button is friendlier (the operator chooses when to clear).
 */

export interface DigestDetailViewProps {
  digest: DigestRow;
  basePath: string;
  /** super_admin sees a deep-link to the source run. */
  isSuperAdmin: boolean;
  /** When super_admin: the platform-agent id needed to build the
   *  run-tab URL. Undefined for non-admin (link is hidden). */
  platformAgentId?: string | null;
}

const TYPE_TONE: Record<string, "ok" | "warn" | "danger" | "ink"> = {
  digest: "ok",
  alert: "warn",
  info: "ink",
};

function formatCreatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function DigestDetailView({
  digest,
  basePath,
  isSuperAdmin,
  platformAgentId,
}: DigestDetailViewProps) {
  return (
    <div className="mx-auto max-w-3xl w-full px-6 py-8 flex flex-col gap-6">
      <Link
        href={basePath}
        className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} /> All digests
      </Link>

      <SectionHeading
        eyebrow="Inbox · digest"
        title={digest.title}
        subtitle={formatCreatedAt(digest.createdAt)}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={TYPE_TONE[digest.type] ?? "ink"}>{digest.type}</Badge>
            {digest.readAt ? (
              <Badge tone="ink">read</Badge>
            ) : (
              <Badge tone="warn">unread</Badge>
            )}
          </div>
        }
      />

      <Card style={{ padding: 28 }}>
        <MarkdownRenderer body={digest.body} />
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        {!digest.readAt && (
          <form action={markDigestAsReadAction}>
            <input type="hidden" name="id" value={digest.id} />
            <button
              type="submit"
              className="rounded-md bg-ink px-4 py-2 text-sm text-ink-inverse hover:bg-ink/90"
            >
              Mark as read
            </button>
          </form>
        )}
        {isSuperAdmin && digest.relatedRunId && platformAgentId && (
          <Link
            href={`/platform/agents/${platformAgentId}?tab=runs#${digest.relatedRunId}`}
            className="rounded-md border border-line-soft px-4 py-2 text-sm text-ink hover:border-line-strong"
          >
            View source run →
          </Link>
        )}
      </div>
    </div>
  );
}
