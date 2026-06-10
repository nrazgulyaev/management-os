"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, AlertCircle, ShieldCheck } from "lucide-react";
import {
  verifyMfaChallengeAction,
  verifyMfaEnrollmentAction,
} from "@/features/security-baseline/mfa-actions";

/**
 * Shared MFA verify form (enrolment + login challenge). RESKIN-AUTH-2 —
 * restyled onto the design-system auth primitives; the six-digit input,
 * server actions, recovery-code reveal and redirects are unchanged.
 */
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
      className="auth-stack"
    >
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="123 456"
        className="input auth-otp-cell w-full tracking-[0.4em]"
        maxLength={6}
        autoFocus
      />
      {error && (
        <div className="auth-notice auth-notice-danger">
          <AlertCircle className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
          <span>{error}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-accent btn-lg auth-submit"
      >
        {pending ? (
          "Verifying…"
        ) : (
          <>
            Verify <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
          </>
        )}
      </button>
      {recoveryCodes && (
        <div className="auth-notice auth-notice-ok flex-col">
          <div className="flex items-center gap-2">
            <ShieldCheck className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
            <span className="font-medium text-ink">
              Save these recovery codes
            </span>
          </div>
          <p>
            Each can be used exactly once if you lose your authenticator.
          </p>
          <ul className="font-mono text-sm grid grid-cols-2 gap-1 mt-1 text-ink">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => router.push("/setup/mfa/recovery-codes")}
            className="auth-link self-start mt-2"
          >
            I have saved them — continue
          </button>
        </div>
      )}
    </form>
  );
}
