"use client";

/**
 * Phase 2.1 PR 2 — InlineEdit (brick B7 · template 05).
 *
 * Click-to-edit field. Display mode renders the current value with
 * a hover-only pen affordance; click swaps in an input, focuses it,
 * and commits on Enter / blur (Escape reverts). Wires to
 * `useDetailForm.setField` from the parent.
 *
 * Polymorphic on `type`: text (default), number, date, select. Date
 * uses the native input picker; select needs `options` to be passed.
 */

import * as React from "react";

export type InlineEditType = "text" | "number" | "date" | "select";

export interface InlineEditProps {
  value: string;
  /** Called on Enter / blur / select-change. */
  onCommit: (next: string) => void;
  /** Called on Escape. Optional — caller can just ignore commits. */
  onCancel?: () => void;
  type?: InlineEditType;
  /** Required when type="select". */
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Accessibility label (mirrors the visible field label). */
  ariaLabel?: string;
  /** Disable editing — render display-only. */
  readOnly?: boolean;
  className?: string;
}

export function InlineEdit({
  value,
  onCommit,
  onCancel,
  type = "text",
  options,
  placeholder,
  ariaLabel,
  readOnly,
  className,
}: InlineEditProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  function commit() {
    if (draft !== value) onCommit(draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
    onCancel?.();
  }

  const wrapperCls = `inline-edit${editing ? " editing" : ""}${readOnly ? " readonly" : ""}${className ? ` ${className}` : ""}`;

  if (!editing || readOnly) {
    return (
      <span
        className={wrapperCls}
        role={readOnly ? undefined : "button"}
        tabIndex={readOnly ? -1 : 0}
        onClick={() => !readOnly && setEditing(true)}
        onKeyDown={(e) => {
          if (readOnly) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(true);
          }
        }}
        aria-label={ariaLabel}
      >
        <span className="inline-edit-value">{value || (placeholder ?? "—")}</span>
        {!readOnly && (
          <svg className="pen" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        )}
      </span>
    );
  }

  if (type === "select" && options) {
    return (
      <span className={wrapperCls}>
        <select
          ref={(el) => {
            inputRef.current = el;
          }}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onCommit(e.target.value);
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
          aria-label={ariaLabel}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </span>
    );
  }

  const inputType = type === "number" ? "number" : type === "date" ? "date" : "text";
  return (
    <span className={wrapperCls}>
      <input
        ref={(el) => {
          inputRef.current = el;
        }}
        type={inputType}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label={ariaLabel}
      />
    </span>
  );
}
