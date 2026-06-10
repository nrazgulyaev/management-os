"use client";

/**
 * Stage 7.F.C.1 — Payment processor connection form.
 *
 * Xendit (Indonesia: QRIS / e-wallets / Virtual Accounts) and Stripe
 * fire real API calls today; Wise Payments / PayPal / Manual default to
 * DryRun until each provider's implementation lands. The form still
 * saves credentials so the implementation slots in transparently when
 * ready.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPaymentConnectionAction,
  testPaymentConnectionAction,
  type CreatePaymentConnectionInput,
} from "@/lib/payment-processors/connection-actions";

type ProviderKey = CreatePaymentConnectionInput["provider"];

const PROVIDER_OPTIONS: Array<{
  key: ProviderKey;
  label: string;
  description: string;
}> = [
  {
    key: "xendit",
    label: "Xendit",
    description:
      "Indonesia rails — QRIS, e-wallets, bank virtual accounts via hosted invoice (live API today)",
  },
  {
    key: "stripe",
    label: "Stripe",
    description: "Card payments + refunds + payouts (live API today)",
  },
  {
    key: "wise_payments",
    label: "Wise Payments",
    description: "Cross-border transfers (DryRun until provider lands)",
  },
  {
    key: "paypal",
    label: "PayPal",
    description: "Card + wallet (DryRun until provider lands)",
  },
  {
    key: "manual",
    label: "Manual",
    description: "Hand-entered payment rail (cash, bank wire, custom)",
  },
];

interface FormProps {
  organizationId: string;
}

export function ConnectPaymentForm({ organizationId }: FormProps) {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderKey>("xendit");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"ok" | "warn" | "err">("ok");

  function handleSubmit(formData: FormData) {
    setError(null);
    setStatusMsg(null);
    setStatusTone("ok");
    const data = buildPayload(provider, formData);
    if (!data) {
      setError("Form data invalid.");
      return;
    }
    startTransition(async () => {
      const result = await createPaymentConnectionAction({
        organizationId,
        data,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatusMsg("Connection saved. Running test…");
      const test = await testPaymentConnectionAction({
        connectionId: result.connectionId,
      });
      if (test.ok) {
        setStatusMsg(
          test.mode === "dry_run"
            ? "Saved in dry-run mode — no live provider is wired, so nothing will actually charge. Add live credentials to transact."
            : test.connected
              ? "Connection verified ✓ — redirecting…"
              : "Connection saved but test returned negative.",
        );
        setStatusTone(
          test.mode === "dry_run"
            ? "warn"
            : test.connected
              ? "ok"
              : "warn",
        );
      } else {
        setStatusMsg(`Saved but test failed: ${test.error}`);
        setStatusTone("err");
      }
      setTimeout(() => {
        router.push(
          `/dashboard/payments/providers/${result.connectionId}`,
        );
      }, 1000);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <label className="block text-sm font-medium mb-1">Provider</label>
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as ProviderKey);
            setError(null);
            setStatusMsg(null);
          }}
          disabled={pending}
          className="w-full rounded border border-stone-300 px-3 py-2 bg-white"
        >
          {PROVIDER_OPTIONS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-stone-500 mt-1">
          {PROVIDER_OPTIONS.find((p) => p.key === provider)?.description}
        </p>
      </div>

      <ProviderFields provider={provider} pending={pending} />

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {statusMsg && (
        <div
          className={`rounded border px-3 py-2 text-sm ${
            statusTone === "err"
              ? "border-red-200 bg-red-50 text-red-700"
              : statusTone === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {statusMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 rounded bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Connect"}
      </button>
    </form>
  );
}

function ProviderFields({
  provider,
  pending,
}: {
  provider: ProviderKey;
  pending: boolean;
}) {
  switch (provider) {
    case "xendit":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field
            name="accountName"
            label="Account label"
            placeholder="Xendit — Bali ops (IDR)"
          />
          <Field
            name="secretKey"
            label="Secret API key"
            type="password"
            placeholder="xnd_development_… or xnd_production_…"
          />
          <Field
            name="callbackToken"
            label="Callback verification token"
            type="password"
            placeholder="From Xendit dashboard → Settings → Webhooks"
          />
          <Select
            name="mode"
            label="Mode"
            options={[
              { v: "live", l: "Live (xnd_production_…)" },
              { v: "test", l: "Test (xnd_development_…)" },
            ]}
          />
          <p className="text-xs text-stone-500">
            After connecting, point the Xendit invoice webhook to{" "}
            <code>/api/webhooks/xendit</code> on this domain. Inbound
            callbacks are verified against the token above.
          </p>
        </fieldset>
      );
    case "stripe":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field
            name="accountName"
            label="Account label"
            placeholder="Stripe — main GBP account"
          />
          <Field
            name="secretKey"
            label="Secret key"
            type="password"
            placeholder="sk_test_… or sk_live_…"
          />
          <Field
            name="publishableKey"
            label="Publishable key"
            placeholder="pk_test_… or pk_live_…"
          />
          <Field
            name="webhookSecret"
            label="Webhook signing secret"
            type="password"
            placeholder="whsec_…"
          />
          <Field
            name="accountId"
            label="Connect account ID (optional)"
            placeholder="acct_…"
            optional
          />
          <Select
            name="mode"
            label="Mode"
            options={[
              { v: "live", l: "Live" },
              { v: "test", l: "Test" },
            ]}
          />
        </fieldset>
      );
    case "wise_payments":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="accountName" label="Account label" />
          <Field name="apiToken" label="API token" type="password" />
          <Field name="profileId" label="Profile ID" />
          <Field
            name="webhookPublicKey"
            label="Webhook public key (optional)"
            optional
          />
          <Select
            name="mode"
            label="Mode"
            options={[
              { v: "live", l: "Live" },
              { v: "test", l: "Sandbox" },
            ]}
          />
        </fieldset>
      );
    case "paypal":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="accountName" label="Account label" />
          <Field name="clientId" label="Client ID" />
          <Field name="clientSecret" label="Client secret" type="password" />
          <Field
            name="webhookId"
            label="Webhook ID (optional)"
            optional
          />
          <Select
            name="mode"
            label="Mode"
            options={[
              { v: "live", l: "Live" },
              { v: "test", l: "Sandbox" },
            ]}
          />
        </fieldset>
      );
    case "manual":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="accountName" label="Account label" />
          <Field name="label" label="Description" />
        </fieldset>
      );
  }
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

function Select({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <select
        name={name}
        required
        className="w-full rounded border border-stone-300 px-3 py-2 bg-white text-sm"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </div>
  );
}

function buildPayload(
  provider: ProviderKey,
  formData: FormData,
): CreatePaymentConnectionInput | null {
  const v = (k: string) => (formData.get(k) ?? "").toString().trim();
  switch (provider) {
    case "xendit":
      return {
        provider: "xendit",
        secretKey: v("secretKey"),
        callbackToken: v("callbackToken"),
        accountName: v("accountName"),
        mode: (v("mode") as "test" | "live") || "test",
      };
    case "stripe":
      return {
        provider: "stripe",
        secretKey: v("secretKey"),
        publishableKey: v("publishableKey"),
        webhookSecret: v("webhookSecret"),
        accountId: v("accountId") || "",
        accountName: v("accountName"),
        mode: (v("mode") as "test" | "live") || "test",
      };
    case "wise_payments":
      return {
        provider: "wise_payments",
        apiToken: v("apiToken"),
        profileId: v("profileId"),
        webhookPublicKey: v("webhookPublicKey") || "",
        accountName: v("accountName"),
        mode: (v("mode") as "test" | "live") || "test",
      };
    case "paypal":
      return {
        provider: "paypal",
        clientId: v("clientId"),
        clientSecret: v("clientSecret"),
        webhookId: v("webhookId") || "",
        accountName: v("accountName"),
        mode: (v("mode") as "test" | "live") || "test",
      };
    case "manual":
      return {
        provider: "manual",
        label: v("label"),
        accountName: v("accountName"),
        mode: "live",
      };
  }
}
