"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { Mail, Lock, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { signupAction, type SignupResult } from "@/features/signup/actions";

/**
 * Stage 10.I.5 — Public signup form.
 *
 * Single-page form, no multi-step wizard. Anti-bot via honeypot
 * (hidden `company` input). Client-side validation mirrors the
 * server-side Zod schema so users see errors before submit.
 *
 * RESKIN-AUTH-2 — restyled onto the design-system form primitives
 * (`.field` / `.input` / `.check` / `.btn-accent`). Server action,
 * honeypot, product radios and field-error wiring unchanged.
 */

type ProductChoice = "mgmt" | "dev" | "both";

export function SignupForm({
  defaultProduct = "both",
}: {
  defaultProduct?: ProductChoice;
}) {
  const [state, action] = useFormState(signupAction, null as SignupResult | null);
  const [product, setProduct] = React.useState<ProductChoice>(defaultProduct);
  const fieldErrors = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <form action={action} className="auth-stack auth-stack-tight">
      <label className="field">
        <span className="field-label">Work email</span>
        <div className="auth-field-wrap">
          <Mail className="auth-field-icon w-4 h-4" strokeWidth={1.7} aria-hidden />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="founder@your-company.com"
            className="input auth-input"
          />
        </div>
        {fieldErrors.email && (
          <p className="field-error">{fieldErrors.email}</p>
        )}
      </label>

      <label className="field">
        <span className="field-label">Workspace name</span>
        <input
          id="organizationName"
          name="organizationName"
          type="text"
          required
          minLength={2}
          autoComplete="organization"
          placeholder="Acme Villas"
          className="input auth-input-plain"
        />
        {fieldErrors.organizationName && (
          <p className="field-error">{fieldErrors.organizationName}</p>
        )}
        <p className="field-help">
          We&apos;ll generate a slug from this. You can rename later.
        </p>
      </label>

      <fieldset className="field">
        <legend className="field-label mb-1.5">Product</legend>
        <div className="grid grid-cols-3 gap-2">
          <ProductRadio
            value="mgmt"
            current={product}
            onChange={setProduct}
            label="Management OS"
            sublabel="Run the portfolio"
          />
          <ProductRadio
            value="dev"
            current={product}
            onChange={setProduct}
            label="Development OS"
            sublabel="Build the next one"
          />
          <ProductRadio
            value="both"
            current={product}
            onChange={setProduct}
            label="Both"
            sublabel="Mgmt + Dev"
          />
        </div>
        {fieldErrors.product && (
          <p className="field-error">{fieldErrors.product}</p>
        )}
      </fieldset>

      <label className="field">
        <span className="field-label">Password</span>
        <div className="auth-field-wrap">
          <Lock className="auth-field-icon w-4 h-4" strokeWidth={1.7} aria-hidden />
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            placeholder="At least 12 characters"
            className="input auth-input font-mono"
          />
        </div>
        {fieldErrors.password && (
          <p className="field-error">{fieldErrors.password}</p>
        )}
        <p className="field-help">
          Minimum 12 characters. Use a passphrase or a password manager.
        </p>
      </label>

      <label className="field">
        <span className="field-label">Confirm password</span>
        <div className="auth-field-wrap">
          <Lock className="auth-field-icon w-4 h-4" strokeWidth={1.7} aria-hidden />
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            placeholder="••••••••••••"
            className="input auth-input font-mono"
          />
        </div>
        {fieldErrors.confirmPassword && (
          <p className="field-error">{fieldErrors.confirmPassword}</p>
        )}
      </label>

      <label className="check items-start text-[13px]">
        <input type="checkbox" name="terms" required />
        <span className="box mt-px" />
        <span className="text-ink-secondary">
          I agree to the{" "}
          <Link href="/legal/terms" className="auth-link">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="auth-link">
            Privacy Policy
          </Link>
          . The 14-day trial does not require a credit card.
        </span>
      </label>
      {fieldErrors.terms && <p className="field-error">{fieldErrors.terms}</p>}

      {/* Honeypot field — hidden from real users; bots fill every input. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[10000px] w-0 h-0 overflow-hidden"
      />

      <input type="hidden" name="product" value={product} />

      <SubmitButton />

      {state && !state.ok && state.error && !state.fieldErrors && (
        <div className="auth-notice auth-notice-danger">
          <AlertCircle className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
          <span>{state.error}</span>
        </div>
      )}
    </form>
  );
}

function ProductRadio({
  value,
  current,
  onChange,
  label,
  sublabel,
}: {
  value: ProductChoice;
  current: ProductChoice;
  onChange: (v: ProductChoice) => void;
  label: string;
  sublabel: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={
        "rounded-[10px] border px-3 py-3 text-left transition-colors " +
        (active
          ? "border-ink bg-muted/40"
          : "border-line-soft bg-surface hover:border-line-strong")
      }
      aria-pressed={active}
    >
      <span className="block text-xs font-medium text-ink">{label}</span>
      <span className="block text-[10px] text-ink-tertiary mt-0.5">
        {sublabel}
      </span>
    </button>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-accent btn-lg auth-submit"
    >
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" /> Provisioning workspace…
        </>
      ) : (
        <>
          Create workspace <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
        </>
      )}
    </button>
  );
}
