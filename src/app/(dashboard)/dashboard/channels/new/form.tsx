"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createChannelAction } from "@/features/channels/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

export function ChannelForm() {
  const [state, dispatch] = useActionState(createChannelAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={dispatch}>
      <FormShell
        title="Channel details"
        footer={
          <>
            <Button asChild variant="ghost">
              <Link href="/dashboard/channels">Cancel</Link>
            </Button>
            <SubmitButton>Create channel</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Name" required error={errs.name?.[0]}>
            <input name="name" required className={inputCls} placeholder="Booking.com" />
          </Field>
          <Field label="Key" required hint="lowercase, used in code" error={errs.key?.[0]}>
            <input name="key" required className={inputCls} placeholder="booking" />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Type" required>
            <select name="type" defaultValue="ota" className={selectCls}>
              <option value="ota">OTA</option>
              <option value="direct">Direct</option>
              <option value="agent">Agent</option>
              <option value="social">Social</option>
              <option value="corporate">Corporate</option>
            </select>
          </Field>
          <Field label="Commission model">
            <select name="commissionModel" defaultValue="" className={selectCls}>
              <option value="">—</option>
              <option value="percent">Percent</option>
              <option value="fixed">Fixed</option>
              <option value="tiered">Tiered</option>
              <option value="none">None</option>
            </select>
          </Field>
          <Field label="Default commission %">
            <input
              name="defaultCommissionPct"
              type="number"
              min={0}
              max={100}
              step="0.01"
              className={inputCls}
              placeholder="15"
            />
          </Field>
        </div>
        <Field label="Status" required hint="active · paused · inactive · archived">
          <select name="status" defaultValue="active" className={selectCls}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </FormShell>
    </form>
  );
}
