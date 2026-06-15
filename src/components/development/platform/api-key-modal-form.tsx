"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { createApiKey } from "@/lib/development/server/api/api-key-actions";

/**
 * Stage 6.P0.6 — Generate API Key modal (Tier 5 admin).
 *
 * Backend ships in Stage 5.J; this is the UI. Plaintext key is shown
 * once after generation (the action returns it; the DB stores only
 * the SHA-256 hash). Caller passes organizationId + currentUserId.
 *
 * Workflow verb: "Generate API key" (the action is generative, not
 * a "create record" — naming reflects that).
 */

const COMMON_SCOPES = [
  { value: "projects:read", label: "projects:read" },
  { value: "projects:write", label: "projects:write" },
  { value: "investors:read", label: "investors:read" },
  { value: "leads:read", label: "leads:read" },
  { value: "leads:write", label: "leads:write" },
  { value: "transactions:read", label: "transactions:read" },
  { value: "webhooks:write", label: "webhooks:write" },
  { value: "*", label: "* (all scopes — sparingly)" },
] as const;

export function ApiKeyModalForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [generated, setGenerated] = useState<{
    fullKey: string;
    last4: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const keyLabel = String(formData.get("keyLabel") ?? "").trim();
    const keyType = String(formData.get("keyType") ?? "live");
    const scopesRaw = formData.getAll("scopes").map((s) => String(s));
    const rateLimitPerMinute = Number(
      formData.get("rateLimitPerMinute") ?? "60",
    );

    startTransition(async () => {
      try {
        const result = await createApiKey({
          keyLabel,
          keyType: keyType as "live" | "test",
          scopes: scopesRaw,
          rateLimitPerMinute,
        });
        if (!result.ok) {
          setError(result.error ?? "Failed to generate API key");
          return;
        }
        setGenerated({ fullKey: result.fullKey, last4: result.last4 });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate API key");
      }
    });
  }

  async function copyToClipboard() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.fullKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard might be denied — user can select+copy manually */
    }
  }

  function handleClose() {
    setOpen(false);
    // Clear generated key state so reopening starts fresh
    setTimeout(() => {
      setGenerated(null);
      setError(null);
    }, 300);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="api-key-generate-trigger">
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Generate API key
      </Button>
      <EntityModal
        open={open}
        onClose={handleClose}
        title={generated ? "API key generated" : "Generate API key"}
        description={
          generated
            ? "Copy this key now — it won't be shown again. The server stores only its hash."
            : "API keys authenticate requests to /api/v1/* endpoints. Each key carries a scope set + rate-limit tier."
        }
        size="md"
      >
        {generated ? (
          <div className="px-5 md:px-6 py-5 flex flex-col gap-4">
            <div className="rounded-md border border-warning/30 bg-warning-weak/30 px-4 py-3 text-sm text-ink">
              ⚠️ This is the only time you'll see the full key. Save it in a secure
              location (1Password / vault) before closing this dialog.
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={generated.fullKey}
                className={`${inputCls} font-mono text-xs`}
                onFocus={(e) => e.currentTarget.select()}
                data-testid="api-key-generated-value"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={copyToClipboard}
                aria-label="Copy key"
              >
                {copied ? (
                  <Check className="w-4 h-4" strokeWidth={1.75} />
                ) : (
                  <Copy className="w-4 h-4" strokeWidth={1.75} />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 mt-2">
              <Button onClick={handleClose}>I&rsquo;ve saved the key</Button>
            </div>
          </div>
        ) : (
          <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
            {error && (
              <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Key label" required hint="Human-readable purpose">
                <input
                  name="keyLabel"
                  required
                  minLength={2}
                  placeholder="Production · investor sync"
                  className={inputCls}
                />
              </Field>
              <Field label="Key type" required>
                <select name="keyType" defaultValue="live" className={selectCls}>
                  <option value="live">Live</option>
                  <option value="test">Test</option>
                </select>
              </Field>
              <Field
                label="Per-minute rate limit"
                hint="Default 60. Tighten for untrusted integrations."
              >
                <input
                  name="rateLimitPerMinute"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  defaultValue={60}
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Scopes" required hint="Multi-select; minimal scopes preferred">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-sm">
                {COMMON_SCOPES.map((s) => (
                  <label
                    key={s.value}
                    className="inline-flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-muted/40 transition-colors min-h-[44px]"
                  >
                    <input
                      type="checkbox"
                      name="scopes"
                      value={s.value}
                      className="w-4 h-4"
                    />
                    <span className="font-mono text-xs">{s.label}</span>
                  </label>
                ))}
              </div>
            </Field>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={pending}>
                Cancel
              </Button>
              <SubmitButton disabled={pending} pendingLabel="Generating…">
                Generate API key
              </SubmitButton>
            </div>
          </form>
        )}
      </EntityModal>
    </>
  );
}
