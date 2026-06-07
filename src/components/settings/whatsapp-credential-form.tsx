"use client";

/**
 * WhatsApp credential form (client).
 *
 * Saves per-org Twilio credentials (encrypted) to oauth_connections. The
 * runtime now honours these — outbound sends + the test message resolve
 * the per-org provider first and fall back to env only when none are
 * saved. Disconnect deactivates the saved row.
 */

import { useState, useTransition } from "react";
import {
  saveWhatsappCredentialsAction,
  sendWhatsappTestMessageAction,
  disconnectWhatsappCredentialsAction,
} from "@/lib/development/server/whatsapp-credential-form-actions";

interface Props {
  organizationId: string;
  hasExistingConnection: boolean;
}

export function WhatsappCredentialForm({
  organizationId,
  hasExistingConnection,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTest, setShowTest] = useState(false);

  function handleSave(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await saveWhatsappCredentialsAction({
        organizationId,
        twilioAccountSid: (formData.get("twilioAccountSid") ?? "").toString().trim(),
        twilioAuthToken: (formData.get("twilioAuthToken") ?? "").toString().trim(),
        whatsappFromNumber: (formData.get("whatsappFromNumber") ?? "").toString().trim(),
        notes: (formData.get("notes") ?? "").toString().trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        hasExistingConnection
          ? "Credentials updated ✓"
          : "Credentials saved ✓ (encrypted in oauth_connections)",
      );
      setShowTest(true);
    });
  }

  function handleTest(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await sendWhatsappTestMessageAction({
        organizationId,
        toPhoneNumber: (formData.get("toPhoneNumber") ?? "").toString().trim(),
        message: (formData.get("message") ?? "").toString().trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        `Test message sent via ${result.provider} using ${
          result.usedSavedCredentials ? "your saved credentials" : "env credentials"
        }${result.messageSid ? ` (sid ${result.messageSid})` : ""}`,
      );
    });
  }

  function handleDisconnect() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await disconnectWhatsappCredentialsAction({
        organizationId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess("WhatsApp disconnected — the runtime falls back to env.");
      setShowTest(false);
    });
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <form action={handleSave} className="space-y-3">
        <h3 className="text-sm font-semibold">Twilio credentials</h3>
        <Field
          name="twilioAccountSid"
          label="Twilio Account SID"
          placeholder="AC + 32 hex characters"
        />
        <Field
          name="twilioAuthToken"
          label="Twilio Auth Token"
          type="password"
          placeholder="Live or test token"
        />
        <Field
          name="whatsappFromNumber"
          label="WhatsApp sender phone"
          placeholder="whatsapp:+15551234567"
        />
        <Field
          name="notes"
          label="Notes (optional)"
          optional
          placeholder="Internal description"
        />

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : hasExistingConnection ? "Update credentials" : "Save credentials"}
          </button>
          {hasExistingConnection && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={pending}
              className="px-4 py-2 rounded border border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Disconnect
            </button>
          )}
        </div>
      </form>

      {(showTest || hasExistingConnection) && (
        <form action={handleTest} className="space-y-3 pt-6 border-t border-stone-200">
          <h3 className="text-sm font-semibold">Send test message</h3>
          <p className="text-xs text-stone-600">
            Uses your saved per-org credentials (falls back to env if none
            saved). Recipient must have opted into the Twilio sandbox if
            you're in test mode.
          </p>
          <Field
            name="toPhoneNumber"
            label="Recipient"
            placeholder="whatsapp:+15551234567"
          />
          <Field
            name="message"
            label="Body"
            placeholder="Hello from Arconique OS — test message."
          />
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send test message"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
  optional = false,
}: {
  name: string;
  label: string;
  type?: "text" | "password";
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label}
        {!optional && <span className="text-red-500"> *</span>}
      </label>
      <input
        name={name}
        type={type}
        required={!optional}
        placeholder={placeholder}
        className="w-full rounded border border-stone-300 px-3 py-2 font-mono text-sm"
      />
    </div>
  );
}
