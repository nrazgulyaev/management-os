"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  verifyMfaChallengeAction,
  verifyMfaEnrollmentAction,
} from "@/features/security-baseline/mfa-actions";

export function MfaVerifyForm({
  mode,
}: {
  mode: "enrolment" | "challenge";
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!/^\d{6}$/.test(code.trim())) {
          setError("Please enter a six-digit code.");
          return;
        }
        startTransition(async () => {
          const fd = new FormData();
          fd.set("code", code.trim());
          const out =
            mode === "enrolment"
              ? await verifyMfaEnrollmentAction(null, fd)
              : await verifyMfaChallengeAction(null, fd);
          if (out.ok) {
            const codes =
              mode === "enrolment" && "recoveryCodes" in out
                ? (out.recoveryCodes as string[] | undefined)
                : undefined;
            if (codes && codes.length > 0) {
              setRecoveryCodes(codes);
            } else {
              router.push("/dashboard");
            }
          } else {
            setError(out.error ?? "Verification failed.");
          }
        });
      }}
      className="flex flex-col gap-3"
    >
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="123 456"
        className="font-mono tabular-nums tracking-widest text-2xl text-center w-full rounded-md border border-line-soft bg-surface px-4 py-3"
        maxLength={6}
        autoFocus
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify code"}
      </Button>
      {recoveryCodes && (
        <div className="rounded-md border border-success/40 bg-success-weak text-success p-4 flex flex-col gap-2 text-xs">
          <p className="font-medium">
            Save these recovery codes — each can be used exactly once if you
            lose your authenticator.
          </p>
          <ul className="font-mono text-sm grid grid-cols-2 gap-1">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => router.push("/setup/mfa/recovery-codes")}
            className="self-start mt-2 text-xs underline"
          >
            I have saved them — continue
          </button>
        </div>
      )}
    </form>
  );
}
