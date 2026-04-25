"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field, FormShell, inputCls } from "@/components/admin/form-shell";
import { Button } from "@/components/ui/button";
import { bootstrapSuperAdminAction, type BootstrapResult } from "./actions";

const initial: BootstrapResult | null = null;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Linking…" : "Bootstrap super-admin"}
    </Button>
  );
}

export function BootstrapForm({
  authUserId,
  email,
  defaultName,
  state,
  ipAddress: _ip,
  userAgent: _ua,
}: {
  authUserId: string;
  email: string;
  defaultName: string;
  state: { stage: string };
  ipAddress: string | null;
  userAgent: string | null;
}) {
  const [result, action] = useActionState(bootstrapSuperAdminAction, initial);
  const requireSecret = state.stage === "locked_requires_secret";

  return (
    <form action={action}>
      <FormShell
        title="Link this auth user as super-admin"
        description={`Will be linked to: ${email} (${authUserId.slice(0, 8)}…)`}
        footer={<Submit />}
      >
        {result && !result.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {result.error}
          </div>
        )}

        <Field label="Full name" required>
          <input
            name="fullName"
            defaultValue={defaultName}
            required
            className={inputCls}
            placeholder="Nikita Razgulyaev"
          />
        </Field>

        <Field
          label={requireSecret ? "ADMIN_BOOTSTRAP_SECRET" : "ADMIN_BOOTSTRAP_SECRET (optional)"}
          required={requireSecret}
          hint={
            requireSecret
              ? "Required because a super-admin already exists."
              : "Not required for the first super-admin."
          }
        >
          <input
            name="secret"
            type="password"
            autoComplete="off"
            className={inputCls}
            placeholder={requireSecret ? "Paste secret" : "Leave blank for first run"}
            required={requireSecret}
          />
        </Field>
      </FormShell>
    </form>
  );
}
