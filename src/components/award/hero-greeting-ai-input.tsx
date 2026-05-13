/**
 * Sprint 4 — Client island for HeroGreetingAI's input.
 *
 * Renders the prompt field + submit button as a useActionState form
 * so the parent can pass any `(prev, formData) => Promise<…>` server
 * action and we'll surface the response inline below the field.
 *
 * Kept in its own file so the HeroGreetingAI server-component shell
 * doesn't need `"use client"` — only the input island does.
 */

"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";

export type HeroAskResult =
  | { ok: true; response?: string }
  | { ok: false; error: string }
  | null;

/**
 * Signature any parent server action must adhere to. The prior state
 * is whatever the action returned last time (null on first render).
 */
export type HeroAskAction = (
  prev: HeroAskResult,
  formData: FormData,
) => Promise<HeroAskResult>;

interface HeroAskInputProps {
  placeholder?: string;
  onAsk?: HeroAskAction;
}

const noopAction: HeroAskAction = async () => null;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="shrink-0 w-9 h-9 rounded-full bg-ink text-ink-inverse inline-flex items-center justify-center hover:bg-ink/90 disabled:opacity-60 transition-colors"
      aria-label="Ask"
      disabled={pending}
    >
      <ArrowRight
        className={`w-4 h-4 ${pending ? "animate-pulse" : ""}`}
        strokeWidth={1.75}
      />
    </button>
  );
}

export function HeroAskInput({
  placeholder = "Just ask me anything!",
  onAsk,
}: HeroAskInputProps) {
  const [state, action] = useActionState<HeroAskResult, FormData>(
    onAsk ?? noopAction,
    null,
  );

  return (
    <>
      <form
        action={action}
        className="flex items-center gap-2 max-w-3xl"
        data-hero-ask-form
      >
        <input
          type="text"
          name="prompt"
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-base md:text-xl text-ink placeholder:text-ink-tertiary outline-none border-b border-line-soft focus:border-line-strong py-2 transition-colors"
          autoComplete="off"
        />
        <Submit />
      </form>
      {state && !state.ok && (
        <p
          role="alert"
          className="mt-2 text-xs text-danger leading-snug"
        >
          {state.error}
        </p>
      )}
      {state && state.ok && state.response && (
        <p className="mt-2 text-sm text-ink-secondary leading-snug">
          {state.response}
        </p>
      )}
    </>
  );
}
