"use client";

/**
 * Stage 7.F.B.1 — Marketing connection form.
 *
 * Single client component covering all 7 supported providers. Renders
 * provider-specific field sets based on the chosen provider, posts
 * to `createMarketingConnectionAction`, then redirects to the detail
 * page. Auto-fires `testMarketingConnectionAction` on success so
 * operator gets immediate feedback.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMarketingConnectionAction,
  testMarketingConnectionAction,
  type CreateMarketingConnectionInput,
} from "@/lib/marketing/connection-actions";

type ProviderKey = CreateMarketingConnectionInput["provider"];

const PROVIDER_OPTIONS: Array<{
  key: ProviderKey;
  label: string;
  description: string;
}> = [
  {
    key: "google_analytics",
    label: "Google Analytics 4",
    description: "Measurement Protocol + Reporting Data API",
  },
  {
    key: "google_ads",
    label: "Google Ads",
    description: "Approved developer token + OAuth refresh token",
  },
  {
    key: "meta_pixel",
    label: "Meta Pixel (Conversions API)",
    description: "Pixel ID + access token + optional appsecret_proof",
  },
  {
    key: "meta_ads",
    label: "Meta Ads",
    description: "Long-lived system-user token + ad account",
  },
  {
    key: "tiktok_ads",
    label: "TikTok Ads",
    description: "Business Centre access token + advertiser id",
  },
  {
    key: "mailchimp",
    label: "Mailchimp",
    description: "API key (datacenter suffix detected automatically)",
  },
  {
    key: "convertkit",
    label: "ConvertKit",
    description: "Public + secret API keys",
  },
];

interface FormProps {
  organizationId: string;
}

export function ConnectMarketingForm({ organizationId }: FormProps) {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderKey>("google_analytics");
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
      const result = await createMarketingConnectionAction({
        organizationId,
        data,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatusMsg("Connection saved. Running test…");
      // Fire test connection so operator gets immediate verification.
      const test = await testMarketingConnectionAction({
        connectionId: result.connectionId,
      });
      if (test.ok) {
        setStatusMsg(
          test.mode === "dry_run"
            ? "Saved in dry-run mode — no live marketing API is wired, so no real data syncs. Add live credentials to go live."
            : test.connected
              ? "Connection verified ✓ — redirecting…"
              : "Connection saved but test returned negative. Check credentials.",
        );
        setStatusTone(
          test.mode === "dry_run" ? "warn" : test.connected ? "ok" : "warn",
        );
      } else {
        setStatusMsg(`Connection saved but test failed: ${test.error}`);
        setStatusTone("err");
      }
      // Redirect to detail page either way.
      setTimeout(() => {
        router.push(
          `/development-os/marketing/connections/${result.connectionId}`,
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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Connect"}
        </button>
        <p className="text-xs text-stone-500">
          Credentials persist on this organization. Encryption-at-rest
          rolls in via the next service-layer pass.
        </p>
      </div>
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
    case "google_analytics":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="measurementId" label="Measurement ID" placeholder="G-XXXXXXXXXX" />
          <Field name="apiSecret" label="Measurement Protocol API secret" type="password" />
          <Field name="propertyId" label="Property ID (numeric)" />
        </fieldset>
      );
    case "google_ads":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="developerToken" label="Developer token" type="password" />
          <Field name="clientId" label="OAuth client ID" />
          <Field name="clientSecret" label="OAuth client secret" type="password" />
          <Field name="refreshToken" label="OAuth refresh token" type="password" />
          <Field name="customerId" label="Customer ID (10 digits, no dashes)" />
          <Field
            name="loginCustomerId"
            label="MCC login customer ID (optional)"
            optional
          />
        </fieldset>
      );
    case "meta_pixel":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="pixelId" label="Pixel ID" />
          <Field name="accessToken" label="Conversions API access token" type="password" />
          <Field name="testEventCode" label="Test event code (optional)" optional />
          <Field
            name="appSecret"
            label="App secret (optional, for appsecret_proof)"
            type="password"
            optional
          />
        </fieldset>
      );
    case "meta_ads":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="accessToken" label="Long-lived system-user token" type="password" />
          <Field name="adAccountId" label="Ad account ID (act_<digits>)" placeholder="act_1234567890" />
          <Field name="businessId" label="Business ID (optional)" optional />
          <Field
            name="appSecret"
            label="App secret (optional)"
            type="password"
            optional
          />
        </fieldset>
      );
    case "tiktok_ads":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="accessToken" label="Access token" type="password" />
          <Field name="advertiserId" label="Advertiser ID" />
          <Field name="appId" label="App ID" />
          <Field name="secret" label="App secret" type="password" />
        </fieldset>
      );
    case "mailchimp":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field
            name="apiKey"
            label="API key (must end in -us<dc>)"
            type="password"
            placeholder="abcdef1234567890-us21"
          />
        </fieldset>
      );
    case "convertkit":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="apiKey" label="Public API key" />
          <Field name="apiSecret" label="Secret API key" type="password" />
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

function buildPayload(
  provider: ProviderKey,
  formData: FormData,
): CreateMarketingConnectionInput | null {
  const v = (k: string) => (formData.get(k) ?? "").toString().trim();
  const opt = (k: string) => (v(k) === "" ? undefined : v(k));
  switch (provider) {
    case "google_analytics":
      return {
        provider: "google_analytics",
        measurementId: v("measurementId"),
        apiSecret: v("apiSecret"),
        propertyId: v("propertyId"),
      };
    case "google_ads":
      return {
        provider: "google_ads",
        developerToken: v("developerToken"),
        clientId: v("clientId"),
        clientSecret: v("clientSecret"),
        refreshToken: v("refreshToken"),
        customerId: v("customerId"),
        loginCustomerId: opt("loginCustomerId") ?? "",
      };
    case "meta_pixel":
      return {
        provider: "meta_pixel",
        pixelId: v("pixelId"),
        accessToken: v("accessToken"),
        testEventCode: opt("testEventCode") ?? "",
        appSecret: opt("appSecret") ?? "",
      };
    case "meta_ads":
      return {
        provider: "meta_ads",
        accessToken: v("accessToken"),
        adAccountId: v("adAccountId"),
        businessId: opt("businessId") ?? "",
        appSecret: opt("appSecret") ?? "",
      };
    case "tiktok_ads":
      return {
        provider: "tiktok_ads",
        accessToken: v("accessToken"),
        advertiserId: v("advertiserId"),
        appId: v("appId"),
        secret: v("secret"),
      };
    case "mailchimp":
      return { provider: "mailchimp", apiKey: v("apiKey") };
    case "convertkit":
      return {
        provider: "convertkit",
        apiKey: v("apiKey"),
        apiSecret: v("apiSecret"),
      };
  }
}
