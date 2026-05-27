"use client";

/**
 * Phase 2.1 PR 4 — AgentComposer (template 07).
 *
 * Bottom-pinned textarea for testing the agent. ⌘+Enter submits;
 * tools-menu chip is presentational until 2.2 wires real tool
 * selection.
 */

import * as React from "react";

export interface AgentComposerProps {
  placeholder?: string;
  /** Called with the trimmed prompt on submit. Promise resolves
   *  when the agent finishes responding. */
  onSubmit: (prompt: string) => Promise<void> | void;
  /** Disable the form while a run is in flight. */
  disabled?: boolean;
  /** Hint shown beneath the input. Default reflects the spec. */
  hint?: React.ReactNode;
  /** Optional initial value (rare — useful for "rerun this prompt"). */
  initial?: string;
}

export function AgentComposer({
  placeholder = "Test-message this agent as a guest…",
  onSubmit,
  disabled,
  hint,
  initial = "",
}: AgentComposerProps) {
  const [value, setValue] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    const prompt = value.trim();
    if (!prompt || busy || disabled) return;
    setBusy(true);
    try {
      await onSubmit(prompt);
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="composer">
      <div className="input-wrap">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          disabled={busy || disabled}
          aria-label="Test prompt"
        />
        <div className="send">
          <button type="button" className="btn btn-ghost btn-sm" disabled>
            Tools ⌄
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void submit()}
            disabled={busy || disabled || value.trim().length === 0}
          >
            {busy ? "Running…" : "▶ Run"}
          </button>
        </div>
      </div>
      <div className="hint">
        {hint ?? <>⌘+Enter to run · runs against staging by default</>}
      </div>
    </div>
  );
}
