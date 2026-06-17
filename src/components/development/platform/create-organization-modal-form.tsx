"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { createOrganization } from "@/lib/development/server/organizations/organization-actions";

/**
 * Platform · super-admin — create a new tenant organization.
 *
 * Wraps the existing `createOrganization` server action (requireSuperAdmin
 * + zod UPPER_SNAKE_CASE validation + onConflictDoNothing). The
 * organizationCode is the durable tenant key; everything else carries the
 * org's defaults. After a successful insert we router.refresh() so the
 * platform directory re-reads listOrganizations().
 */

const ORG_TYPES = [
  { value: "developer_client", label: "Developer client" },
  { value: "partner_organization", label: "Partner organization" },
  { value: "arconique_internal", label: "Arconique internal" },
  { value: "demo_test", label: "Demo / test" },
] as const;

const TIERS = [
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" },
  { value: "internal", label: "Internal" },
  { value: "custom", label: "Custom" },
] as const;

export function CreateOrganizationModalForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const organizationCode = String(formData.get("organizationCode") ?? "")
      .trim()
      .toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    const organizationType = String(
      formData.get("organizationType") ?? "developer_client",
    );
    const subscriptionTier = String(formData.get("subscriptionTier") ?? "starter");
    const countryCode = String(formData.get("countryCode") ?? "ID").trim();
    const primaryCurrency = String(formData.get("primaryCurrency") ?? "IDR").trim();

    startTransition(async () => {
      try {
        const result = await createOrganization({
          organizationCode,
          name,
          organizationType:
            organizationType as "developer_client" | "partner_organization" | "arconique_internal" | "demo_test" | "archived",
          subscriptionTier:
            subscriptionTier as "starter" | "professional" | "enterprise" | "internal" | "custom",
          countryCode: countryCode || "ID",
          primaryCurrency: primaryCurrency || "IDR",
        });
        if (!result.ok) {
          setError(result.error ?? "Failed to create organization");
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create organization");
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="org-create-trigger"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Organization
      </Button>
      <EntityModal
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="Create organization"
        description="Provision a new tenant. The organization code is the durable tenant key (UPPER_SNAKE_CASE) — it cannot be changed later."
        size="md"
      >
        <form
          action={handleSubmit}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field
              label="Organization code"
              required
              hint="UPPER_SNAKE_CASE, e.g. ENSO_CAPITAL"
            >
              <input
                name="organizationCode"
                required
                minLength={2}
                placeholder="ENSO_CAPITAL"
                pattern="[A-Za-z0-9_]+"
                className={`${inputCls} font-mono uppercase`}
              />
            </Field>
            <Field label="Name" required hint="Human-readable legal name">
              <input
                name="name"
                required
                minLength={2}
                placeholder="Enso Capital"
                className={inputCls}
              />
            </Field>
            <Field label="Type" required>
              <select
                name="organizationType"
                defaultValue="developer_client"
                className={selectCls}
              >
                {ORG_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subscription tier" required>
              <select
                name="subscriptionTier"
                defaultValue="starter"
                className={selectCls}
              >
                {TIERS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Country code" hint="ISO-2, default ID">
              <input
                name="countryCode"
                defaultValue="ID"
                maxLength={2}
                className={`${inputCls} uppercase`}
              />
            </Field>
            <Field label="Primary currency" hint="ISO-3, default IDR">
              <input
                name="primaryCurrency"
                defaultValue="IDR"
                maxLength={3}
                className={`${inputCls} uppercase`}
              />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Creating…">
              Create organization
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
