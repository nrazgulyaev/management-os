"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { subscribeWebhook } from "@/lib/development/server/webhooks/webhook-actions";

/**
 * Stage 6.P0.6 — Subscribe Webhook modal (Tier 5 admin).
 *
 * Backend ships in Stage 5.J; this is the UI. Signing secret is shown
 * once after subscription (Stripe-style). Subscribed events are
 * comma-separated; supports literal event names ("lead.created") or
 * namespace wildcards ("lead.*", "*").
 *
 * Workflow verb: "Subscribe webhook".
 */

export function WebhookModalForm({
  organizationId,
  currentUserId,
}: {
  organizationId: string;
  currentUserId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [generated, setGenerated] = useState<{ signingSecret: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const webhookLabel = String(formData.get("webhookLabel") ?? "").trim();
    const endpointUrl = String(formData.get("endpointUrl") ?? "").trim();
    const eventsRaw = String(formData.get("subscribedEvents") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    const events = eventsRaw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (events.length === 0) {
      setError("At least one subscribed event is required.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await subscribeWebhook({
          organizationId,
          createdBy: currentUserId,
          webhookLabel,
          endpointUrl,
          subscribedEvents: events,
          notes: notes || undefined,
        });
        if (!result.ok) {
          setError(result.error ?? "Failed to subscribe webhook");
          return;
        }
        setGenerated({ signingSecret: result.signingSecret });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to subscribe webhook");
      }
    });
  }

  async function copyToClipboard() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.signingSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* user can select+copy manually */
    }
  }

  function handleClose() {
    setOpen(false);
    setTimeout(() => {
      setGenerated(null);
      setError(null);
    }, 300);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="webhook-subscribe-trigger">
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Subscribe webhook
      </Button>
      <EntityModal
        open={open}
        onClose={handleClose}
        title={generated ? "Webhook subscribed" : "Subscribe webhook"}
        description={
          generated
            ? "Save this signing secret — it won't be shown again. Use it to verify the X-Arconique-Signature header on inbound deliveries."
            : "Outbound HTTP notifications to your endpoint. Each delivery is HMAC-SHA256 signed (Stripe-style header)."
        }
        size="md"
      >
        {generated ? (
          <div className="px-5 md:px-6 py-5 flex flex-col gap-4">
            <div className="rounded-md border border-warning/30 bg-warning-weak/30 px-4 py-3 text-sm text-ink">
              ⚠️ This is the only time you&rsquo;ll see the signing secret. Save it
              in a secure location before closing this dialog.
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={generated.signingSecret}
                className={`${inputCls} font-mono text-xs`}
                onFocus={(e) => e.currentTarget.select()}
                data-testid="webhook-secret-value"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={copyToClipboard}
                aria-label="Copy secret"
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
              <Button onClick={handleClose}>I&rsquo;ve saved the secret</Button>
            </div>
          </div>
        ) : (
          <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
            {error && (
              <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
                {error}
              </div>
            )}
            <Field label="Webhook label" required hint="Human-readable purpose">
              <input
                name="webhookLabel"
                required
                minLength={2}
                placeholder="Zapier · lead capture"
                className={inputCls}
              />
            </Field>
            <Field
              label="Endpoint URL"
              required
              hint="HTTPS recommended. POSTs JSON with event payloads."
            >
              <input
                name="endpointUrl"
                type="url"
                inputMode="url"
                required
                placeholder="https://hooks.zapier.com/…"
                className={inputCls}
              />
            </Field>
            <Field
              label="Subscribed events"
              required
              hint="Comma- or whitespace-separated. Examples: lead.created, project.*, * (all)"
            >
              <input
                name="subscribedEvents"
                required
                placeholder="lead.created, lead.qualified, contract.signed"
                className={inputCls}
              />
            </Field>
            <Field label="Notes">
              <textarea name="notes" rows={2} className={textareaCls} placeholder="Optional" />
            </Field>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={pending}>
                Cancel
              </Button>
              <SubmitButton disabled={pending} pendingLabel="Subscribing…">
                Subscribe webhook
              </SubmitButton>
            </div>
          </form>
        )}
      </EntityModal>
    </>
  );
}
