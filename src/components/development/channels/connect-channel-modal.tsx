"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/forms/entity-modal";
import { createChannelConnection } from "@/lib/channel-manager/actions";
import type { ChannelName } from "@/lib/db/schema/channel-manager";

/**
 * Stage 6.P1.E.1 — Connect Channel modal.
 *
 * Discriminated union form: each channel renders its own credential
 * fields. Submit calls the createChannelConnection server action which
 * encrypts + tests the connection before persisting. Test result
 * surfaces inline so the operator can fix bad credentials without
 * losing the form state.
 *
 * Workflow verb: "Connect channel" (per P0.2 — verbs match actions).
 */

export interface ConnectChannelModalProps {
  villaId: string;
  villaName: string;
  /** Channel to connect this villa to. Locks the form to that channel. */
  channel: ChannelName;
  triggerLabel?: string;
}

export function ConnectChannelModal({
  villaId,
  villaName,
  channel,
  triggerLabel,
}: ConnectChannelModalProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    null | { passed: boolean; message?: string }
  >(null);
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    setTestResult(null);
    const externalPropertyId = String(formData.get("externalPropertyId") ?? "").trim();
    if (!externalPropertyId) {
      setError("External property ID is required");
      return;
    }
    const credentials = collectCredentials(channel, formData);
    if (!credentials) {
      setError("Please fill in all required credential fields");
      return;
    }
    const commissionPctRaw = String(
      formData.get("channelCommissionPct") ?? "",
    ).trim();
    const channelCommissionPct = commissionPctRaw
      ? Number(commissionPctRaw)
      : undefined;

    startTransition(async () => {
      const result = await createChannelConnection({
        villaId,
        channel,
        externalPropertyId,
        credentials,
        channelCommissionPct,
      });
      if (!result.ok) {
        setError(result.error ?? "Connection failed");
        return;
      }
      setTestResult({
        passed: !!result.testConnectionPassed,
        message: result.testConnectionPassed
          ? "Connection test passed."
          : "Connection saved but test failed — check credentials and retry.",
      });
      router.refresh();
      if (result.testConnectionPassed) {
        // Auto-close on success after a brief moment so operator sees the success state.
        setTimeout(() => setOpen(false), 1200);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid={`connect-channel-${channel}`}
      >
        <Plug className="w-3 h-3" strokeWidth={1.75} />
        <span className="ml-1">{triggerLabel ?? "Connect"}</span>
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title={`Connect ${CHANNEL_LABELS[channel]}`}
        description={`Villa: ${villaName}`}
        size="md"
      >
        <form
          action={handleSubmit}
          className="space-y-3"
          data-testid="connect-channel-form"
        >
          <Field label={CHANNEL_PROPERTY_ID_LABEL[channel]}>
            <input
              name="externalPropertyId"
              required
              className={inputCls}
              placeholder={CHANNEL_PROPERTY_ID_PLACEHOLDER[channel]}
            />
          </Field>

          <ChannelCredentialFields channel={channel} />

          <Field label="Channel commission % (optional)">
            <input
              name="channelCommissionPct"
              type="number"
              step="0.01"
              min="0"
              max="100"
              className={inputCls}
              placeholder="15.00"
            />
          </Field>

          {error && (
            <p className="text-xs text-danger" data-testid="connect-error">
              {error}
            </p>
          )}
          {testResult && (
            <p
              className={`text-xs ${testResult.passed ? "text-success" : "text-warning"}`}
              data-testid="connect-test-result"
            >
              {testResult.message}
            </p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              Connect
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </EntityModal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Per-channel credential field renderers
// ---------------------------------------------------------------------------

function ChannelCredentialFields({ channel }: { channel: ChannelName }) {
  switch (channel) {
    case "booking_com":
      return (
        <>
          <Field label="Username">
            <input name="username" required className={inputCls} />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              required
              className={inputCls}
            />
          </Field>
          <Field label="Hotel ID">
            <input name="hotelId" required className={inputCls} />
          </Field>
          <Field label="Environment">
            <select name="environment" required className={inputCls}>
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </Field>
        </>
      );
    case "airbnb":
      return (
        <>
          <p className="text-[11px] text-ink-tertiary">
            Full OAuth flow lands in P5. For now, paste tokens manually
            (request via the Airbnb Hosting API console).
          </p>
          <Field label="Access token">
            <input
              name="accessToken"
              type="password"
              required
              className={inputCls}
            />
          </Field>
          <Field label="Refresh token">
            <input
              name="refreshToken"
              type="password"
              required
              className={inputCls}
            />
          </Field>
          <Field label="Listing ID">
            <input name="listingId" required className={inputCls} />
          </Field>
          <Field label="Token expires (Unix ms)">
            <input
              name="expiresAt"
              type="number"
              required
              className={inputCls}
              placeholder="e.g. 1735689600000"
            />
          </Field>
        </>
      );
    case "trip_com":
      return (
        <>
          <Field label="Partner ID">
            <input name="partnerId" required className={inputCls} />
          </Field>
          <Field label="API Key">
            <input
              name="apiKey"
              type="password"
              required
              className={inputCls}
            />
          </Field>
          <Field label="Hotel ID">
            <input name="hotelId" required className={inputCls} />
          </Field>
        </>
      );
    case "agoda":
      return (
        <>
          <Field label="Hotel ID">
            <input name="hotelId" required className={inputCls} />
          </Field>
          <Field label="API Key">
            <input
              name="apiKey"
              type="password"
              required
              className={inputCls}
            />
          </Field>
          <Field label="API Secret">
            <input
              name="apiSecret"
              type="password"
              required
              className={inputCls}
            />
          </Field>
          <Field label="Environment">
            <select name="environment" required className={inputCls}>
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </Field>
        </>
      );
    case "expedia":
    case "vrbo":
    case "hotels_com":
      return (
        <>
          <Field label="Hotel ID">
            <input name="hotelId" required className={inputCls} />
          </Field>
          <Field label="EQC Username">
            <input name="eqcUsername" required className={inputCls} />
          </Field>
          <Field label="EQC Password">
            <input
              name="eqcPassword"
              type="password"
              required
              className={inputCls}
            />
          </Field>
          <Field label="Environment">
            <select name="environment" required className={inputCls}>
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </Field>
        </>
      );
    case "direct":
      return (
        <p className="text-xs text-ink-secondary">
          Direct bookings originate inside the platform — no external
          credentials needed.
        </p>
      );
  }
}

function collectCredentials(
  channel: ChannelName,
  fd: FormData,
): Record<string, unknown> | null {
  const get = (k: string) => String(fd.get(k) ?? "").trim();
  switch (channel) {
    case "booking_com": {
      const u = get("username");
      const p = get("password");
      const h = get("hotelId");
      const e = get("environment");
      if (!u || !p || !h || !e) return null;
      return { username: u, password: p, hotelId: h, environment: e };
    }
    case "airbnb": {
      const a = get("accessToken");
      const r = get("refreshToken");
      const l = get("listingId");
      const ex = get("expiresAt");
      if (!a || !r || !l || !ex) return null;
      return {
        accessToken: a,
        refreshToken: r,
        listingId: l,
        expiresAt: Number(ex),
      };
    }
    case "trip_com": {
      const pid = get("partnerId");
      const k = get("apiKey");
      const h = get("hotelId");
      if (!pid || !k || !h) return null;
      return { partnerId: pid, apiKey: k, hotelId: h };
    }
    case "agoda": {
      const h = get("hotelId");
      const k = get("apiKey");
      const s = get("apiSecret");
      const env = get("environment");
      if (!h || !k || !s || !env) return null;
      return { hotelId: h, apiKey: k, apiSecret: s, environment: env };
    }
    case "expedia":
    case "vrbo":
    case "hotels_com": {
      const h = get("hotelId");
      const u = get("eqcUsername");
      const p = get("eqcPassword");
      const env = get("environment");
      if (!h || !u || !p || !env) return null;
      return {
        hotelId: h,
        eqcUsername: u,
        eqcPassword: p,
        environment: env,
      };
    }
    case "direct":
      return {};
  }
}

// ---------------------------------------------------------------------------
// UI primitives — kept inline; small enough not to extract.
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-xs min-h-[36px]";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}

export const CHANNEL_LABELS: Record<ChannelName, string> = {
  booking_com: "Booking.com",
  airbnb: "Airbnb",
  trip_com: "Trip.com",
  agoda: "Agoda",
  expedia: "Expedia",
  vrbo: "VRBO",
  hotels_com: "Hotels.com",
  direct: "Direct",
};

const CHANNEL_PROPERTY_ID_LABEL: Record<ChannelName, string> = {
  booking_com: "Hotel ID on Booking.com",
  airbnb: "Listing ID on Airbnb",
  trip_com: "Hotel ID on Trip.com",
  agoda: "Hotel ID on Agoda",
  expedia: "Hotel ID on Expedia",
  vrbo: "Property ID on VRBO",
  hotels_com: "Hotel ID on Hotels.com",
  direct: "Internal property ID",
};

const CHANNEL_PROPERTY_ID_PLACEHOLDER: Record<ChannelName, string> = {
  booking_com: "e.g. 12345678",
  airbnb: "e.g. 987654321",
  trip_com: "e.g. trip-h-12345",
  agoda: "e.g. 1122334",
  expedia: "e.g. EXP-1122334",
  vrbo: "e.g. VR-12345",
  hotels_com: "e.g. HC-12345",
  direct: "—",
};
