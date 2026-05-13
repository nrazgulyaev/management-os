"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { startImpersonationAction } from "@/lib/subscription-os/actions";

export function ImpersonationStartButton({
  organizationCode,
}: {
  organizationCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const r = await startImpersonationAction(organizationCode);
          if (!r.ok) {
            alert(r.error ?? "Could not start impersonation");
            return;
          }
          router.refresh();
        });
      }}
      className="inline-flex items-center gap-2 text-sm text-ink hover:text-accent disabled:opacity-50"
    >
      <Eye className="w-4 h-4" strokeWidth={1.75} />
      {pending ? "Starting…" : "View as customer"}
    </button>
  );
}
