"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateOrganizationBranding } from "@/lib/development/server/organizations/organization-actions";

/**
 * Platform · super-admin — per-organization white-label branding form.
 *
 * Replaces the read-only <pre> dump on the branding page. Edits the
 * org's branding_config JSONB via the existing `updateOrganizationBranding`
 * server action (requireSuperAdmin). Hex colors are validated again
 * server-side in renderBrandingCss to defend against CSS injection; we
 * also pre-validate client-side for fast feedback. Logo / favicon are
 * plain URLs (stored, not uploaded).
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export interface BrandingFormValues {
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string;
  favicon_url?: string;
}

export function BrandingForm({
  organizationCode,
  initial,
}: {
  organizationCode: string;
  initial: BrandingFormValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [primary, setPrimary] = useState(initial.primary_color ?? "");
  const [secondary, setSecondary] = useState(initial.secondary_color ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? "");
  const [faviconUrl, setFaviconUrl] = useState(initial.favicon_url ?? "");

  const save = () => {
    setError(null);
    setMessage(null);
    if (primary && !HEX_RE.test(primary)) {
      setError("Primary color must be a 6-digit hex (e.g. #1A2B3C).");
      return;
    }
    if (secondary && !HEX_RE.test(secondary)) {
      setError("Accent color must be a 6-digit hex (e.g. #1A2B3C).");
      return;
    }

    // Build the config, dropping empty fields so we don't persist "".
    const config: Record<string, string> = {};
    if (primary) config.primary_color = primary;
    if (secondary) config.secondary_color = secondary;
    if (logoUrl) config.logo_url = logoUrl.trim();
    if (faviconUrl) config.favicon_url = faviconUrl.trim();

    startTransition(async () => {
      const result = await updateOrganizationBranding({
        organizationCode,
        brandingConfig: config,
      });
      if (result.ok) {
        setMessage("Branding saved.");
        router.refresh();
      } else {
        setError(result.error ?? "Save failed");
      }
    });
  };

  const swatch = (value: string) =>
    HEX_RE.test(value) ? value : "transparent";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          Primary color (hex)
        </span>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-6 h-6 rounded border border-line-soft shrink-0"
            style={{ background: swatch(primary) }}
            aria-hidden
          />
          <input
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            placeholder="#1A2B3C"
            className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm font-mono"
            data-testid="branding-primary"
          />
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          Accent color (hex)
        </span>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-6 h-6 rounded border border-line-soft shrink-0"
            style={{ background: swatch(secondary) }}
            aria-hidden
          />
          <input
            value={secondary}
            onChange={(e) => setSecondary(e.target.value)}
            placeholder="#FF6B35"
            className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm font-mono"
            data-testid="branding-secondary"
          />
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          Logo URL
        </span>
        <input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://cdn.example.com/logo.svg"
          className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
          data-testid="branding-logo"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          Favicon URL
        </span>
        <input
          value={faviconUrl}
          onChange={(e) => setFaviconUrl(e.target.value)}
          placeholder="https://cdn.example.com/favicon.ico"
          className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
          data-testid="branding-favicon"
        />
      </label>

      <div className="md:col-span-2 flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={save}
          data-testid="branding-save"
        >
          {pending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
          Save branding
        </Button>
        {message && <span className="text-xs text-success">{message}</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
