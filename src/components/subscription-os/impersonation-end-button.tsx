"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { endImpersonationAction } from "@/lib/subscription-os/actions";

export function ImpersonationEndButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await endImpersonationAction();
          router.refresh();
        });
      }}
      className="text-xs font-medium bg-ink text-ink-inverse px-4 py-2 rounded-full hover:bg-ink/90 disabled:opacity-50"
    >
      {pending ? "Ending…" : "End impersonation"}
    </button>
  );
}
