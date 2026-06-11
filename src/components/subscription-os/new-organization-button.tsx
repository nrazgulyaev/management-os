/**
 * DOMAIN B (platform-console) — "New organization" create surface.
 *
 * Mounted on /platform/organizations. Collects name + slug + products +
 * an optional initial plan, then calls `createOrgAction` (super-admin
 * gated + audited server-side). On success it routes the operator to the
 * new per-org console so they can immediately assign / adjust the plan.
 *
 * Honest, pre-PSP: assigning a plan here attaches the catalog tier so
 * feature-gating + the lifecycle FSM work — no Stripe charge is captured.
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
        New organization
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="New organization"
        description="Create a customer tenant and optionally attach an initial plan. Audit-logged. No charge is captured (operator-assigned)."
        size="md"
      >
        {open && (
          <NewOrgForm plans={plans} onDone={() => setOpen(false)} />
        )}
      </EntityModal>
    </>
  );
}

function NewOrgForm({
  plans,
  onDone,
}: {
  plans: AssignablePlanOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [orgType, setOrgType] =
    React.useState<CreateOrgInput["organizationType"]>("developer_client");
  const [products, setProducts] = React.useState<ProductSlug[]>(["mgmt"]);
  const [planCode, setPlanCode] = React.useState<string>("");

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const toggleProduct = (p: ProductSlug) =>
    setProducts((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );

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
        startTransition(async () => {
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
          // Soft warning carried alongside ok=true (org created, plan failed).
          if (res.error) {
            setErr(res.error);
          }
          onDone();
          if (res.organizationCode) {
            router.push(`/platform/${res.organizationCode}`);
          } else {
            router.refresh();
          }
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

      {err && <p className="text-xs text-danger">{err}</p>}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create organization"}
        </Button>
      </div>
    </form>
  );
}
