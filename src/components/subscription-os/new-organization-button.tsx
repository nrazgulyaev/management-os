/**
 * DOMAIN B (platform-console) — "New tenant" create surface.
 *
 * Mounted on /platform/organizations. Collects name + slug + products + an
 * optional initial plan, and — by default — the tenant's first admin login
 * (email + name + optional password). It then either:
 *   · createTenantWithAdminAction — org + Supabase auth user + super_admin +
 *     'admin' cabinet (the "a customer bought access" one-shot), or
 *   · createOrgAction — org only, when "Create an admin login" is unchecked.
 *
 * Both paths are super-admin gated + audited server-side. When the admin
 * password is auto-generated, it's shown ONCE in a success panel for the
 * operator to share (transactional email is a no-op stub today).
 *
 * Honest, pre-PSP: assigning a plan attaches the catalog tier so feature-
 * gating + the lifecycle FSM work — no Stripe charge is captured.
 */

"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  createOrgAction,
  createTenantWithAdminAction,
  type CreateOrgInput,
} from "@/lib/subscription-os/org-provisioning-actions";
import type { AssignablePlanOption } from "@/lib/subscription-os/queries";

type ProductSlug = "mgmt" | "dev";

const ORG_TYPES: Array<{ value: CreateOrgInput["organizationType"]; label: string }> = [
  { value: "developer_client", label: "Developer client" },
  { value: "partner_organization", label: "Partner organization" },
  { value: "demo_test", label: "Demo / test" },
  { value: "arconique_internal", label: "Arconique internal" },
];

function slugify(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

interface CreatedTenant {
  organizationCode: string;
  adminEmail: string | null;
  generatedPassword: string | null;
}

export function NewOrganizationButton({
  plans,
}: {
  plans: AssignablePlanOption[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        New tenant
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="New tenant"
        description="Create a customer tenant + its first admin login. Optionally attach a plan. Audit-logged. No charge is captured (operator-assigned)."
        size="md"
      >
        {open && <NewOrgForm plans={plans} onClose={() => setOpen(false)} />}
      </EntityModal>
    </>
  );
}

function NewOrgForm({
  plans,
  onClose,
}: {
  plans: AssignablePlanOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<CreatedTenant | null>(null);

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [orgType, setOrgType] =
    React.useState<CreateOrgInput["organizationType"]>("developer_client");
  const [products, setProducts] = React.useState<ProductSlug[]>(["mgmt"]);
  const [planCode, setPlanCode] = React.useState<string>("");

  // Admin login (default on — the "they bought access" flow).
  const [withAdmin, setWithAdmin] = React.useState(true);
  const [adminEmail, setAdminEmail] = React.useState("");
  const [adminName, setAdminName] = React.useState("");
  const [adminPassword, setAdminPassword] = React.useState("");

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const toggleProduct = (p: ProductSlug) =>
    setProducts((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );

  // Success panel — shown after a tenant + admin is created so the operator
  // can copy the one-time credentials before navigating.
  if (created) {
    return (
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="rounded-md border border-line-soft bg-surface p-4">
          <p className="text-sm font-medium text-ink">
            Tenant <span className="font-mono">{created.organizationCode}</span> created.
          </p>
          {created.adminEmail ? (
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Field label="Admin email" value={created.adminEmail} />
              {created.generatedPassword ? (
                <>
                  <Field label="Temporary password" value={created.generatedPassword} mono />
                  <p className="text-xs text-warn">
                    Shown once — copy it now and share it securely. The admin should
                    change it on first sign-in. (We don&apos;t store or email it.)
                  </p>
                </>
              ) : (
                <p className="text-xs text-ink-tertiary">
                  The admin signs in with the password you set.
                </p>
              )}
              <p className="text-xs text-ink-tertiary">
                Sign-in URL: <span className="font-mono">management.arconique.com</span>
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-ink-tertiary">
              No admin login was created — add one later before the tenant can sign in.
            </p>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onClose();
              router.refresh();
            }}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={() => {
              onClose();
              router.push(`/platform/${created.organizationCode}`);
            }}
          >
            Open tenant console
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (name.trim().length < 2) {
          setErr("Name must be at least 2 characters");
          return;
        }
        if (!/^[A-Z0-9_]{2,60}$/.test(effectiveSlug)) {
          setErr("Slug must be UPPER_SNAKE_CASE (A-Z, 0-9, _), 2–60 chars");
          return;
        }
        if (products.length === 0) {
          setErr("Select at least one product");
          return;
        }
        if (withAdmin) {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail.trim())) {
            setErr("Enter a valid admin email");
            return;
          }
          if (adminName.trim().length < 2) {
            setErr("Admin name must be at least 2 characters");
            return;
          }
          if (adminPassword.length > 0 && adminPassword.length < 12) {
            setErr("Password must be at least 12 characters (or leave blank to auto-generate)");
            return;
          }
        }
        startTransition(async () => {
          if (withAdmin) {
            const res = await createTenantWithAdminAction({
              name: name.trim(),
              organizationCode: effectiveSlug,
              organizationType: orgType,
              productsEnabled: products,
              initialPlanCode: planCode || undefined,
              adminEmail: adminEmail.trim(),
              adminFullName: adminName.trim(),
              adminPassword: adminPassword || undefined,
            });
            if (!res.ok) {
              setErr(res.error ?? "Failed to create tenant");
              return;
            }
            setCreated({
              organizationCode: res.organizationCode ?? effectiveSlug,
              adminEmail: res.adminEmail ?? null,
              generatedPassword: res.generatedPassword ?? null,
            });
            return;
          }
          // Org-only path.
          const res = await createOrgAction({
            name: name.trim(),
            organizationCode: effectiveSlug,
            organizationType: orgType,
            productsEnabled: products,
            initialPlanCode: planCode || undefined,
          });
          if (!res.ok) {
            setErr(res.error ?? "Failed to create organization");
            return;
          }
          setCreated({
            organizationCode: res.organizationCode ?? effectiveSlug,
            adminEmail: null,
            generatedPassword: null,
          });
        });
      }}
      className="flex flex-col gap-4 px-5 py-5"
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-label">Organization name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Whitmore Developments"
          autoFocus
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-label">Slug · org code</span>
        <Input
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toUpperCase());
          }}
          placeholder="WHITMORE_DEV"
          className="font-mono"
        />
        <span className="text-xs text-ink-tertiary">
          UPPER_SNAKE_CASE. Auto-derived from the name until you edit it.
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-label">Organization type</span>
        <Select
          value={orgType}
          onChange={(e) =>
            setOrgType(e.target.value as CreateOrgInput["organizationType"])
          }
        >
          {ORG_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </label>

      <fieldset className="flex flex-col gap-2 text-sm">
        <span className="text-label">Products</span>
        <div className="flex gap-4">
          <Checkbox
            label="Management OS (mgmt)"
            checked={products.includes("mgmt")}
            onChange={() => toggleProduct("mgmt")}
          />
          <Checkbox
            label="Development OS (dev)"
            checked={products.includes("dev")}
            onChange={() => toggleProduct("dev")}
          />
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-label">Initial plan (optional)</span>
        <Select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
          <option value="">No plan yet — assign later</option>
          {plans.map((p) => (
            <option key={p.planCode} value={p.planCode}>
              {p.displayName} ({p.planCode})
            </option>
          ))}
        </Select>
        <span className="text-xs text-ink-tertiary">
          Starts a trial window. Operator-assigned — no charge is captured.
        </span>
      </label>

      <fieldset className="flex flex-col gap-3 border-t border-line-soft pt-4">
        <Checkbox
          label="Create an admin login for this tenant"
          checked={withAdmin}
          onChange={() => setWithAdmin((v) => !v)}
        />
        {withAdmin && (
          <div className="flex flex-col gap-3 pl-1">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-label">Admin email</span>
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="owner@tenant.com"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-label">Admin full name</span>
              <Input
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Jane Doe"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-label">Temporary password (optional)</span>
              <Input
                type="text"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Leave blank to auto-generate"
                className="font-mono"
              />
              <span className="text-xs text-ink-tertiary">
                Min 12 chars. Blank → a strong password is generated and shown once.
                The admin gets global super_admin for their org and can sign in
                immediately.
              </span>
            </label>
          </div>
        )}
      </fieldset>

      {err && <p className="text-xs text-danger">{err}</p>}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : withAdmin ? "Create tenant + admin" : "Create organization"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-widest text-ink-tertiary">{label}</span>
      <span className={`text-sm text-ink select-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
