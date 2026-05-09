"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signupAction, type SignupResult } from "@/features/signup/actions";

/**
 * Stage 10.I.5 — Public signup form.
 *
 * Single-page form, no multi-step wizard. Anti-bot via honeypot
 * (hidden `company` input). Client-side validation mirrors the
 * server-side Zod schema so users see errors before submit.
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
    <form action={action} className="flex flex-col gap-5 max-w-md mx-auto">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="founder@your-company.com"
          className="rounded-md border border-line-soft bg-surface px-3 py-2 text-sm focus:outline-none focus:border-ink"
        />
        {fieldErrors.email && (
          <p className="text-xs text-danger mt-1">{fieldErrors.email}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="organizationName"
          className="text-sm font-medium text-ink"
        >
          Workspace name
        </label>
        <input
          id="organizationName"
          name="organizationName"
          type="text"
          required
          minLength={2}
          autoComplete="organization"
          placeholder="Acme Villas"
          className="rounded-md border border-line-soft bg-surface px-3 py-2 text-sm focus:outline-none focus:border-ink"
        />
        {fieldErrors.organizationName && (
          <p className="text-xs text-danger mt-1">
            {fieldErrors.organizationName}
          </p>
        )}
        <p className="text-[11px] text-ink-tertiary mt-1">
          We&apos;ll generate a slug from this. You can rename later.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink mb-1">Product</legend>
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
          <p className="text-xs text-danger mt-1">{fieldErrors.product}</p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono focus:outline-none focus:border-ink"
        />
        {fieldErrors.password && (
          <p className="text-xs text-danger mt-1">{fieldErrors.password}</p>
        )}
        <p className="text-[11px] text-ink-tertiary mt-1">
          Minimum 12 characters. Use a passphrase or a password manager.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="confirmPassword"
          className="text-sm font-medium text-ink"
        >
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono focus:outline-none focus:border-ink"
        />
        {fieldErrors.confirmPassword && (
          <p className="text-xs text-danger mt-1">
            {fieldErrors.confirmPassword}
          </p>
        )}
      </div>

      <label className="flex items-start gap-2 text-xs text-ink-secondary">
        <input
          type="checkbox"
          name="terms"
          required
          className="mt-0.5 accent-ink"
        />
        <span>
          I agree to the{" "}
          <Link href="/legal/terms" className="underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="underline">
            Privacy Policy
          </Link>
          . The 14-day trial does not require a credit card.
        </span>
      </label>
      {fieldErrors.terms && (
        <p className="text-xs text-danger -mt-3">{fieldErrors.terms}</p>
      )}

      {/* Honeypot field — hidden from real users; bots fill every input. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        style={{
          position: "absolute",
          left: "-10000px",
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
      />

      <input type="hidden" name="product" value={product} />

      <SubmitButton />

      {state && !state.ok && state.error && !state.fieldErrors && (
        <p className="text-xs text-danger text-center">{state.error}</p>
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
        "rounded-md border px-3 py-3 text-left transition-colors " +
        (active
          ? "border-ink bg-muted/30"
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
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
      {pending ? "Provisioning workspace…" : "Get started free"}
    </Button>
  );
}
