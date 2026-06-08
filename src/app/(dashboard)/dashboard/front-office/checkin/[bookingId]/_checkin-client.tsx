"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckinFlow } from "@/components/front-office/checkin-flow";
import { IdOcrPreview, type OcrPayload } from "@/components/front-office/id-ocr-preview";
import type { CheckinFlowState } from "@/features/front-office/checkin-state";
import { completeCheckinAction } from "@/features/front-office/checkin-actions";

export interface CheckinBookingSummary {
  guestName: string;
  villaName: string;
  checkIn: string;
  checkOut: string;
  pax: string;
}

function genDoorCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function CheckinClient({
  bookingId,
  staffUserId,
  initialState,
  booking,
  issuedDoorCode,
}: {
  bookingId: string;
  staffUserId: string;
  initialState: CheckinFlowState;
  booking: CheckinBookingSummary;
  issuedDoorCode: string | null;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  // One stable code for this check-in (reuse an already-issued one).
  const doorCode = React.useMemo(() => issuedDoorCode ?? genDoorCode(), [issuedDoorCode]);

  return (
    <>
      {error && <p className="text-sm text-danger mb-2">{error}</p>}
      <CheckinFlow
        initialState={initialState}
        staffUserId={staffUserId}
        onCancel={() => router.push("/dashboard/front-office/arrivals")}
        onComplete={async (final) => {
          const res = await completeCheckinAction({
            bookingId,
            steps: final.steps as unknown as Record<string, unknown>,
            doorCode,
          });
          if (res.ok) router.push("/dashboard/front-office/arrivals");
          else setError(res.error ?? "Could not complete check-in.");
        }}
        renderStep={(step, state, patchStep) => {
          if (step === "identity") {
            return (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink-secondary">
                  Verify the guest&apos;s ID. Enter the details from the document
                  (live OCR capture is a follow-up — manual entry is audit-logged).
                </p>
                <IdOcrPreview
                  ocr={(state.steps.identity.payload ?? null) as OcrPayload | null}
                  onChange={(next) =>
                    patchStep({
                      payload: { ...next, ocrSuccess: !!next.name },
                      manualOverride: true,
                    })
                  }
                />
              </div>
            );
          }
          if (step === "stay") {
            return (
              <div className="flex flex-col gap-3">
                <div className="rounded-md border border-line-soft bg-muted/20 p-3 text-sm">
                  <div className="font-medium text-ink">{booking.guestName}</div>
                  <div className="text-ink-secondary">
                    {booking.villaName} · {booking.checkIn} → {booking.checkOut} · {booking.pax}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!state.steps.stay.completedAt}
                    onChange={(e) =>
                      patchStep({
                        completedAt: e.target.checked ? new Date().toISOString() : undefined,
                      })
                    }
                  />
                  Stay details confirmed with the guest
                </label>
              </div>
            );
          }
          if (step === "sign") {
            return (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!state.steps.sign.completedAt}
                  onChange={(e) =>
                    patchStep({
                      completedAt: e.target.checked ? new Date().toISOString() : undefined,
                      payload: { signed: e.target.checked },
                    })
                  }
                />
                Guest signed the registration form (digital or paper)
              </label>
            );
          }
          // handover
          return (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border border-line-soft bg-surface p-4 text-center">
                <div className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary mb-1">
                  Villa door code
                </div>
                <div className="text-3xl font-mono tracking-[0.3em] text-ink">{doorCode}</div>
                <div className="text-xs text-ink-tertiary mt-1">
                  Share with the guest and confirm the key handover below.
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!state.steps.handover.completedAt}
                  onChange={(e) =>
                    patchStep({
                      completedAt: e.target.checked ? new Date().toISOString() : undefined,
                      payload: { doorCode },
                    })
                  }
                />
                Key &amp; door code handed to the guest
              </label>
            </div>
          );
        }}
      />
    </>
  );
}
