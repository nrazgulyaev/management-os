"use client";

import { useActionState } from "react";
import { updateOwnerProfileAction } from "@/features/owner-portal/profile-actions";

export interface OwnerProfileInitial {
  displayName: string;
  email: string;
  phone: string;
}

export function OwnerProfileForm({ initial }: { initial: OwnerProfileInitial }) {
  const [state, dispatch] = useActionState(updateOwnerProfileAction, null);

  return (
    <form action={dispatch} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        Name
        <input
          name="displayName"
          required
          minLength={2}
          defaultValue={initial.displayName}
          className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
        />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
          Email
          <input
            name="email"
            type="email"
            defaultValue={initial.email}
            placeholder="you@example.com"
            className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
          Phone
          <input
            name="phone"
            defaultValue={initial.phone}
            placeholder="+62 …"
            className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Save profile
        </button>
        {state?.ok && <span className="text-xs text-success">Saved.</span>}
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
      <p className="text-xs text-ink-tertiary">
        Payout &amp; banking details are managed separately and require
        additional verification — contact your operator to change them.
      </p>
    </form>
  );
}
