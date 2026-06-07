"use client";

/**
 * Stage 7.F.B.3 — Banking connection form (5 providers).
 *
 * Same shape as the marketing connection form. Posts to
 * `createBankConnectionAction`, auto-tests, redirects to detail.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createBankConnectionAction,
  testBankConnectionAction,
  type CreateBankConnectionInput,
} from "@/lib/banking/connection-actions";

type ProviderKey = CreateBankConnectionInput["provider"];

const PROVIDER_OPTIONS: Array<{
  key: ProviderKey;
  label: string;
  description: string;
}> = [
  {
    key: "revolut",
    label: "Revolut Business",
    description: "API key + optional inbound webhook secret",
  },
  {
    key: "wise",
    label: "Wise",
    description: "API token + profile ID",
  },
  {
    key: "mandiri",
    label: "Bank Mandiri",
    description: "Manual statement import (CSV) + optional Corporate API token",
  },
  {
    key: "bca",
    label: "BCA",
    description: "Manual statement import (CSV) + optional KlikBCA Bisnis token",
  },
  {
    key: "manual",
    label: "Manual / other",
    description: "Hand-entered account; transactions land via CSV upload",
  },
];

interface FormProps {
  organizationId: string;
}

export function ConnectBankForm({ organizationId }: FormProps) {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderKey>("revolut");
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
      const result = await createBankConnectionAction({
        organizationId,
        data,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatusMsg("Connection saved. Running test…");
      const test = await testBankConnectionAction({
        connectionId: result.connectionId,
      });
      if (test.ok) {
        setStatusMsg(
          test.mode === "dry_run"
            ? "Saved in dry-run mode — no live bank API is wired, so no real sync runs. Add live credentials to go live."
            : test.connected
              ? "Connection verified ✓ — redirecting…"
              : "Connection saved but test returned negative. Verify credentials.",
        );
        setStatusTone(
          test.mode === "dry_run" ? "warn" : test.connected ? "ok" : "warn",
        );
      } else {
        setStatusMsg(`Saved but test failed: ${test.error}`);
        setStatusTone("err");
      }
      setTimeout(() => {
        router.push(`/development-os/banking/${result.connectionId}`);
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
    case "revolut":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="accountName" label="Account label" placeholder="Revolut — main GBP" />
          <Field
            name="externalAccountId"
            label="Revolut counterparty / account ID"
          />
          <Field name="currency" label="Currency (3 letters)" placeholder="GBP" />
          <Field name="apiKey" label="API key" type="password" />
          <Select
            name="environment"
            label="Environment"
            options={[
              { v: "production", l: "Production" },
              { v: "sandbox", l: "Sandbox" },
            ]}
          />
          <Field
            name="webhookSecret"
            label="Webhook signing secret (optional)"
            type="password"
            optional
          />
        </fieldset>
      );
    case "wise":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="accountName" label="Account label" placeholder="Wise USD" />
          <Field name="externalAccountId" label="Wise borderless account ID" />
          <Field name="currency" label="Currency (3 letters)" placeholder="USD" />
          <Field name="apiToken" label="API token" type="password" />
          <Field name="profileId" label="Profile ID" />
          <Select
            name="environment"
            label="Environment"
            options={[
              { v: "production", l: "Production" },
              { v: "sandbox", l: "Sandbox" },
            ]}
          />
          <Field
            name="webhookPublicKey"
            label="Webhook public key (optional, RSA fingerprint)"
            optional
          />
        </fieldset>
      );
    case "mandiri":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="accountName" label="Account label" placeholder="Mandiri Operasional" />
          <Field name="accountNumber" label="Account number" />
          <Field name="currency" label="Currency" placeholder="IDR" />
          <Field
            name="partnerApiToken"
            label="Mandiri Corporate API token (optional)"
            type="password"
            optional
          />
        </fieldset>
      );
    case "bca":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="accountName" label="Account label" placeholder="BCA Operasional" />
          <Field name="accountNumber" label="Account number" />
          <Field name="currency" label="Currency" placeholder="IDR" />
          <Field
            name="partnerApiToken"
            label="KlikBCA Bisnis API token (optional)"
            type="password"
            optional
          />
        </fieldset>
      );
    case "manual":
      return (
        <fieldset disabled={pending} className="space-y-3">
          <Field name="accountName" label="Account label" placeholder="Petty cash IDR" />
          <Field name="externalAccountId" label="Reference id" />
          <Field name="currency" label="Currency" placeholder="IDR" />
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
): CreateBankConnectionInput | null {
  const v = (k: string) => (formData.get(k) ?? "").toString().trim();
  switch (provider) {
    case "revolut":
      return {
        provider: "revolut",
        apiKey: v("apiKey"),
        environment: (v("environment") as "production" | "sandbox") || "sandbox",
        webhookSecret: v("webhookSecret") || "",
        accountName: v("accountName"),
        externalAccountId: v("externalAccountId"),
        currency: v("currency").toUpperCase(),
      };
    case "wise":
      return {
        provider: "wise",
        apiToken: v("apiToken"),
        profileId: v("profileId"),
        environment: (v("environment") as "production" | "sandbox") || "sandbox",
        webhookPublicKey: v("webhookPublicKey") || "",
        accountName: v("accountName"),
        externalAccountId: v("externalAccountId"),
        currency: v("currency").toUpperCase(),
      };
    case "mandiri":
      return {
        provider: "mandiri",
        accountNumber: v("accountNumber"),
        partnerApiToken: v("partnerApiToken") || "",
        accountName: v("accountName"),
        currency: (v("currency") || "IDR").toUpperCase(),
      };
    case "bca":
      return {
        provider: "bca",
        accountNumber: v("accountNumber"),
        partnerApiToken: v("partnerApiToken") || "",
        accountName: v("accountName"),
        currency: (v("currency") || "IDR").toUpperCase(),
      };
    case "manual":
      return {
        provider: "manual",
        label: v("label"),
        accountName: v("accountName"),
        externalAccountId: v("externalAccountId"),
        currency: v("currency").toUpperCase(),
      };
  }
}
