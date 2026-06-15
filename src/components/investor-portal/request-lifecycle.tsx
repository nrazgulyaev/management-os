import { Check } from "lucide-react";
import { PortalBadge } from "@/components/investor-portal/portal-primitives";
import {
  PORTAL_REQUEST_LIFECYCLE,
  PORTAL_REQUEST_STATUS_LABEL,
  PORTAL_REQUEST_STATUS_TONE,
  portalRequestLifecycleIndex,
  type PortalRequestStatus,
} from "@/lib/development/constants/investor-request-constants";

/** Status pill for a portal request — tone-coded by lifecycle state. */
export function RequestStatusBadge({ status }: { status: string }) {
  const s = status as PortalRequestStatus;
  return (
    <PortalBadge tone={PORTAL_REQUEST_STATUS_TONE[s] ?? "neutral"}>
      {PORTAL_REQUEST_STATUS_LABEL[s] ?? status.replace(/_/g, " ")}
    </PortalBadge>
  );
}

/**
 * Horizontal stepper for the request happy path
 * (submitted → under review → approved → executed). Terminal off-ramps
 * (rejected / cancelled) collapse to a single tone-coded note instead of
 * the stepper. Pure server component.
 */
export function RequestLifecycle({ status }: { status: string }) {
  const s = status as PortalRequestStatus;

  if (s === "rejected" || s === "cancelled") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-ink-tertiary">Lifecycle:</span>
        <RequestStatusBadge status={s} />
        <span className="text-ink-tertiary">
          {s === "rejected"
            ? "The Arconique team declined this request."
            : "This request was cancelled before execution."}
        </span>
      </div>
    );
  }

  const currentIdx = portalRequestLifecycleIndex(s);

  return (
    <ol className="flex items-center gap-2" aria-label="Request lifecycle">
      {PORTAL_REQUEST_LIFECYCLE.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={step} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={[
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium",
                  done
                    ? "bg-success text-white"
                    : active
                      ? "bg-ink text-ink-inverse"
                      : "bg-muted text-ink-tertiary",
                ].join(" ")}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={2.5} /> : i + 1}
              </span>
              <span
                className={[
                  "text-[11px] whitespace-nowrap",
                  active
                    ? "text-ink font-medium"
                    : done
                      ? "text-ink-secondary"
                      : "text-ink-tertiary",
                ].join(" ")}
              >
                {PORTAL_REQUEST_STATUS_LABEL[step]}
              </span>
            </div>
            {i < PORTAL_REQUEST_LIFECYCLE.length - 1 && (
              <span
                className={[
                  "h-px w-6",
                  i < currentIdx ? "bg-success" : "bg-line-soft",
                ].join(" ")}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
