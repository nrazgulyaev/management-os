"use client";

import { useActionState, useState } from "react";
import {
  FormShell,
  Field,
  inputCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { issueGuestStayTokenAction } from "@/features/guest-stays/actions";

export function IssueTokenForm({ bookingId }: { bookingId: string }) {
  const [state, dispatch] = useActionState(issueGuestStayTokenAction, null);
  const [copied, setCopied] = useState(false);
  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "";
  const stayUrl =
    state?.token && baseUrl ? `${baseUrl}/stay/${state.token}` : null;
  return (
    <form action={dispatch}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            <SubmitButton>Issue token</SubmitButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Issued to (email)">
            <input type="email" name="issuedToEmail" maxLength={200} className={inputCls} />
          </Field>
          <Field label="Issued to (phone, E.164)">
            <input type="text" name="issuedToPhone" maxLength={40} className={inputCls} placeholder="+62…" />
          </Field>
        </div>
        <Field label="Custom expiry (optional)">
          <input type="datetime-local" name="expiresAt" className={inputCls} />
        </Field>
        {state?.ok && state.token && stayUrl && (
          <div className="rounded-md border border-success/40 bg-success-weak/30 p-4 text-sm">
            <div className="text-ink font-medium mb-1.5">
              Token issued — copy now (will not be shown again):
            </div>
            <div className="font-mono text-[12px] break-all bg-canvas/60 rounded-sm p-2">
              {stayUrl}
            </div>
            <button
              type="button"
              className="text-xs text-ink hover:underline underline-offset-4 mt-2"
              onClick={async () => {
                if (!stayUrl) return;
                try {
                  await navigator.clipboard.writeText(stayUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* noop */
                }
              }}
            >
              {copied ? "Copied ✓" : "Copy URL"}
            </button>
          </div>
        )}
      </FormShell>
    </form>
  );
}
