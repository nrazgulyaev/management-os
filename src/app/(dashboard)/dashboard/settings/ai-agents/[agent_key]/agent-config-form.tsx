"use client";

/**
 * Block 03 — no-code agent-config surface.
 *
 * Three knobs an operator can change WITHOUT touching the prompt:
 *   - Mode             auto · semi · off  (autonomy / HITL)
 *   - Tone             short free-text style directive
 *   - Knowledge sources which grounding sources the drafter may read
 *
 * Each saves independently via its own server action (reusing the existing
 * agent-config-actions pattern). Optimistic local state + inline status.
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  setAgentModeAction,
  setAgentToneAction,
  setAgentKnowledgeSourcesAction,
} from "@/features/ai-agents/agent-config-actions";
import type {
  ConfigurableAgentKey,
  AgentMode,
  KnowledgeSources,
} from "@/features/ai-agents/agent-config-keys";

interface Props {
  agentKey: ConfigurableAgentKey;
  currentMode: AgentMode;
  currentTone: string | null;
  currentSources: KnowledgeSources;
  /** True for the unified-inbox agent — its mode drives the inbox loop. */
  drivesInbox: boolean;
}

const MODES: { value: AgentMode; label: string; blurb: string }[] = [
  {
    value: "auto",
    label: "Auto",
    blurb: "AI may draft and send replies on its own (still audit-logged).",
  },
  {
    value: "semi",
    label: "Semi (review)",
    blurb: "AI drafts; a human reviews and presses Send. Recommended.",
  },
  {
    value: "off",
    label: "Off",
    blurb: "No AI drafting at all — humans write every reply.",
  },
];

const SOURCE_LABELS: { key: keyof KnowledgeSources; label: string; blurb: string }[] = [
  {
    key: "conversation",
    label: "Conversation",
    blurb: "The thread transcript. The spine of every draft.",
  },
  {
    key: "project_memory",
    label: "Project knowledge",
    blurb: "Facts already established with this contact / property.",
  },
  {
    key: "templates",
    label: "Message templates",
    blurb: "The workspace's approved templates as a style reference.",
  },
];

export function AgentConfigForm({
  agentKey,
  currentMode,
  currentTone,
  currentSources,
  drivesInbox,
}: Props) {
  const [mode, setMode] = React.useState<AgentMode>(currentMode);
  const [tone, setTone] = React.useState(currentTone ?? "");
  const [sources, setSources] = React.useState<KnowledgeSources>(currentSources);
  const [pending, startTransition] = React.useTransition();
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function note(msg: string) {
    setError(null);
    setStatus(msg);
  }
  function fail(msg: string) {
    setStatus(null);
    setError(msg);
  }

  function saveMode(next: AgentMode) {
    const prev = mode;
    setMode(next);
    startTransition(async () => {
      const r = await setAgentModeAction({ agentKey, mode: next });
      if (!r.ok) {
        setMode(prev);
        fail(r.error);
      } else {
        note(`Mode set to ${next}.`);
      }
    });
  }

  function saveTone() {
    const value = tone.trim();
    startTransition(async () => {
      const r = await setAgentToneAction({
        agentKey,
        tone: value.length > 0 ? value : null,
      });
      if (!r.ok) fail(r.error);
      else note(r.hasTone ? "Tone saved." : "Tone cleared — using default.");
    });
  }

  function toggleSource(key: keyof KnowledgeSources) {
    const next = { ...sources, [key]: !sources[key] };
    const prev = sources;
    setSources(next);
    startTransition(async () => {
      const r = await setAgentKnowledgeSourcesAction({
        agentKey,
        knowledgeSources: next,
      });
      if (!r.ok) {
        setSources(prev);
        fail(r.error);
      } else {
        note("Knowledge sources updated.");
      }
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Mode */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">Autonomy mode</span>
          {drivesInbox && (
            <Badge tone="accent">Drives the unified inbox</Badge>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {MODES.map((m) => {
            const active = mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                disabled={pending}
                onClick={() => saveMode(m.value)}
                aria-pressed={active}
                className={`text-left rounded-2xl border p-4 transition disabled:opacity-60 ${
                  active
                    ? "border-accent bg-accent-weak/30 shadow-soft-card"
                    : "border-line-soft bg-surface hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{m.label}</span>
                  {active && <Badge tone="success">Active</Badge>}
                </div>
                <p className="mt-1 text-xs text-ink-secondary leading-relaxed">
                  {m.blurb}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tone */}
      <div>
        <label className="block text-sm font-medium mb-2">Tone</label>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
          <input
            type="text"
            value={tone}
            maxLength={280}
            onChange={(e) => setTone(e.target.value)}
            placeholder="e.g. warm and concise; formal; friendly but professional"
            className="flex-1 rounded-md border border-line-soft bg-canvas px-3 py-2 text-sm"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={saveTone}
          >
            Save tone
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-ink-tertiary">
          Folded into the draft system prompt. Leave empty for the agent's
          default tone. Max 280 characters.
        </p>
      </div>

      {/* Knowledge sources */}
      <div>
        <span className="block text-sm font-medium mb-2">Knowledge sources</span>
        <ul className="space-y-2">
          {SOURCE_LABELS.map((s) => {
            const on = sources[s.key];
            return (
              <li
                key={s.key}
                className="flex items-center justify-between rounded-xl border border-line-soft bg-surface px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-ink-secondary mt-0.5">
                    {s.blurb}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggleSource(s.key)}
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${
                    on
                      ? "border-success bg-success-weak text-success"
                      : "border-line-soft bg-muted text-ink-secondary hover:bg-inset"
                  }`}
                >
                  {on ? "On" : "Off"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="min-h-[1.25rem]" aria-live="polite">
        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : status ? (
          <p className="text-xs text-success" role="status">
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}
