"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FormShell,
  Field,
  inputCls,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createOwnerStayRequestAction } from "@/features/owner-stays/actions";

interface Choice {
  ownerId: string;
  ownerName: string;
  villas: { id: string; unitCode: string; projectName: string | null }[];
}

export function OwnerStayRequestForm({ choices }: { choices: Choice[] }) {
  const router = useRouter();
  const [state, dispatch] = useActionState(createOwnerStayRequestAction, null);
  const [ownerId, setOwnerId] = useState<string>(choices[0]?.ownerId ?? "");

  const villas = useMemo(() => {
    const c = choices.find((c) => c.ownerId === ownerId);
    return c?.villas ?? [];
  }, [choices, ownerId]);

  useEffect(() => {
    if (state?.ok && state.requestId) {
      router.push(`/owner/stays/${state.requestId}`);
    }
  }, [state, router]);

  return (
    <form action={dispatch}>
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <SubmitButton>Submit request</SubmitButton>
          </>
        }
      >
        <Field label="Owner" required>
          <select
            name="ownerId"
            required
            className={selectCls}
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            {choices.map((c) => (
              <option key={c.ownerId} value={c.ownerId}>
                {c.ownerName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Villa" required>
          <select name="villaId" required className={selectCls} defaultValue="">
            <option value="">Select villa…</option>
            {villas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.unitCode}
                {v.projectName ? ` · ${v.projectName}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Check-in" required>
            <input type="date" name="requestedStart" required className={inputCls} />
          </Field>
          <Field label="Check-out" required>
            <input type="date" name="requestedEnd" required className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Guests count">
            <input type="number" name="guestsCount" min={0} max={40} className={inputCls} />
          </Field>
        </div>

        <Field label="Purpose / notes">
          <textarea
            name="purpose"
            rows={3}
            maxLength={500}
            className={textareaCls}
            placeholder="Family stay, prep visit, etc."
          />
        </Field>

        <p className="text-xs text-ink-tertiary leading-relaxed">
          We'll confirm availability and admin approval after you submit. Some
          dates may need additional review (e.g. peak season, conflicting
          guest bookings) — you'll see that on the next page.
        </p>
      </FormShell>
    </form>
  );
}
