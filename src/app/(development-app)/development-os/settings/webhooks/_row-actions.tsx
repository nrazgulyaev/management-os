"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import {
  testFireWebhookScoped,
  rotateSigningSecretScoped,
  unsubscribeWebhookScoped,
  loadDeliveryLogScoped,
  type DeliveryLogRow,
} from "./_actions";

/**
 * Per-row webhook controls + expandable delivery log.
 *
 * All actions go through the org-scoped co-located adapters in _actions.ts
 * (which verify the subscription belongs to the caller's org before
 * delegating). Renders as two table cells appended to each row plus a
 * full-width expandable log row.
 */

const btn =
  "text-xs hover:underline disabled:opacity-50 disabled:no-underline";

export function WebhookRowActions({
  subscriptionId,
  isActive,
}: {
  subscriptionId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [log, setLog] = useState<DeliveryLogRow[] | null>(null);
  const [rotated, setRotated] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingUnsub, setConfirmingUnsub] = useState(false);

  const testFire = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await testFireWebhookScoped({ subscriptionId });
      if (r.ok) {
        setNotice(
          `Test fired${r.status != null ? ` · response ${r.status}` : ""}.`,
        );
        if (expanded) void refreshLog();
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  const rotate = () => {
    setError(null);
    setNotice(null);
    setRotated(null);
    startTransition(async () => {
      const r = await rotateSigningSecretScoped({ subscriptionId });
      if (r.ok) {
        setRotated(r.signingSecret);
      } else {
        setError(r.error);
      }
    });
  };

  const unsubscribe = () => {
    if (!confirmingUnsub) {
      setConfirmingUnsub(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await unsubscribeWebhookScoped({ subscriptionId });
      if (r.ok) {
        setConfirmingUnsub(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  async function refreshLog() {
    setLogLoading(true);
    const r = await loadDeliveryLogScoped({ subscriptionId });
    setLogLoading(false);
    if (r.ok) setLog(r.rows);
    else setError(r.error);
  }

  const toggleLog = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && log === null) void refreshLog();
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={testFire}
          disabled={pending || !isActive}
          className={btn}
          data-testid={`webhook-test-${subscriptionId}`}
        >
          {pending && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
          Test fire
        </button>
        <button
          type="button"
          onClick={rotate}
          disabled={pending}
          className={btn}
          data-testid={`webhook-rotate-${subscriptionId}`}
        >
          Rotate secret
        </button>
        {isActive && (
          <button
            type="button"
            onClick={unsubscribe}
            disabled={pending}
            className={`${btn} text-danger`}
            data-testid={`webhook-unsub-${subscriptionId}`}
          >
            {confirmingUnsub ? "Confirm unsubscribe" : "Unsubscribe"}
          </button>
        )}
        {confirmingUnsub && (
          <button
            type="button"
            onClick={() => setConfirmingUnsub(false)}
            className="text-xs text-ink-3 hover:underline"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={toggleLog}
          className="text-xs text-ink-3 hover:underline inline-flex items-center gap-0.5"
          data-testid={`webhook-log-toggle-${subscriptionId}`}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          Deliveries
        </button>
      </div>

      {rotated && (
        <div className="mt-2 rounded-md border border-warning/30 bg-warning-weak/30 px-3 py-2 text-[11px]">
          New signing secret (shown once):{" "}
          <code className="font-mono break-all">{rotated}</code>
        </div>
      )}
      {notice && <div className="mt-1 text-[11px] text-success">{notice}</div>}
      {error && <div className="mt-1 text-[11px] text-danger">{error}</div>}

      {expanded && (
        <div className="mt-2 rounded-md border border-line-soft bg-muted/20 p-2">
          {logLoading ? (
            <div className="text-[11px] text-ink-3 px-1 py-2">
              <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
              Loading deliveries…
            </div>
          ) : log && log.length > 0 ? (
            <table className="data text-[11px]">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Status</th>
                  <th className="num">HTTP</th>
                  <th className="num">Attempt</th>
                  <th>Scheduled</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {log.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.eventType}</td>
                    <td>{d.status}</td>
                    <td className="num">{d.httpStatusCode ?? "—"}</td>
                    <td className="num">{d.attemptNumber ?? "—"}</td>
                    <td>
                      {d.scheduledAt
                        ? new Date(d.scheduledAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="text-ink-3 truncate max-w-[200px]">
                      {d.errorMessage ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-[11px] text-ink-3 px-1 py-2">
              No deliveries yet. Use “Test fire” to send a test.ping.
            </div>
          )}
        </div>
      )}
    </>
  );
}
